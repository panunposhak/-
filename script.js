/* ===============================
   FIREBASE & GLOBAL VARIABLES
=============================== */
if (typeof firebase === 'undefined' || !firebase.apps.length) { console.error("Firebase not loaded!"); }
const db = firebase.firestore();
const auth = firebase.auth();

let allProducts = []; 
let appliedDiscount = 0;
let currentUser = null;
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

/* ===============================
   INITIALIZATION
=============================== */
window.onload = function() {
    initAuth(); 
    loadProducts();
    highlightActiveCategory();
    checkAnnouncement();
    
    // Custom Cursor Logic
    const cursorDot = document.getElementById("cursor-dot");
    const cursorOutline = document.getElementById("cursor-outline");
    if(cursorDot && cursorOutline){
        window.addEventListener("mousemove", (e) => {
            cursorDot.style.left = `${e.clientX}px`; 
            cursorDot.style.top = `${e.clientY}px`;
            cursorOutline.animate({ left: `${e.clientX}px`, top: `${e.clientY}px` }, { duration: 500, fill: "forwards" });
        });
    }
};

/* ===============================
   REAL AI BOT LOGIC
=============================== */
function toggleChat() {
    const chat = document.getElementById('ai-chat');
    chat.style.display = chat.style.display === 'flex' ? 'none' : 'flex';
}

function handleChatKey(e) {
    if (e.key === 'Enter') sendUserMessage();
}

function sendUserMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMsgToChat(text, 'user');
    input.value = "";
    processBotResponse(text);
}

function botReply(type) {
    let msg = "";
    if(type === 'track') msg = "I want to track my order.";
    else if(type === 'shipping') msg = "What are the shipping charges?";
    else if(type === 'return') msg = "What is the return policy?";
    else if(type === 'human') msg = "Connect me to a human.";
    
    addMsgToChat(msg, 'user');
    processBotResponse(msg);
}

function addMsgToChat(text, sender) {
    const body = document.getElementById('chat-body');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

async function processBotResponse(input) {
    const lower = input.toLowerCase();
    const body = document.getElementById('chat-body');
    
    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'msg bot';
    typing.innerText = '...';
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;

    let reply = "I'm sorry, I didn't understand. Try clicking one of the options above.";

    // 1. Check for Order ID pattern (#A1B2C3 or 8 chars)
    if (lower.startsWith("#") || (lower.length === 8 && !lower.includes(" "))) {
        let searchId = input.toUpperCase();
        if(!searchId.startsWith("#")) searchId = "#" + searchId;
        
        try {
            const q = await db.collection("orders").where("trackingId", "==", searchId).get();
            if (!q.empty) {
                const o = q.docs[0].data();
                reply = `Order ${searchId} found! \nStatus: ${o.status}\nItems: ${o.product}`;
            } else {
                reply = "I couldn't find an order with that ID. Please check and try again.";
            }
        } catch (e) { reply = "Network error checking order."; }
    }
    // 2. Standard FAQs
    else if (lower.includes("track") || lower.includes("where")) {
        reply = "To track an order, please type your Order ID starting with # (e.g., #A1B2C3).";
    }
    else if (lower.includes("shipping") || lower.includes("cost")) {
        reply = "Shipping is FREE for Prepaid orders. For COD, it's ₹50 (Srinagar) or ₹120 (Rest of India).";
    }
    else if (lower.includes("return") || lower.includes("exchange")) {
        reply = "We accept returns within 7 days for defective items. Please contact support on WhatsApp.";
    }
    else if (lower.includes("human") || lower.includes("talk")) {
        reply = "Redirecting you to our WhatsApp Support...";
        setTimeout(() => { window.open('https://wa.me/919103463033', '_blank'); }, 2000);
    }

    // Remove typing and show reply
    setTimeout(() => {
        body.removeChild(typing);
        addMsgToChat(reply, 'bot');
    }, 800);
}

/* ===============================
   INSTANT SEARCH
=============================== */
function instantSearch() {
    const query = document.getElementById('global-search').value.toLowerCase();
    const filtered = allProducts.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(query))
    );
    document.getElementById("collection-title").innerText = query ? `Search Results` : `Current Collection`;
    renderGrid(filtered);
}

/* ===============================
   AUTHENTICATION
=============================== */
function initAuth() {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            // Hide guest, Show user
            const guestPanel = document.getElementById('auth-guest');
            const userPanel = document.getElementById('auth-user');
            if(guestPanel) guestPanel.style.display = 'none';
            if(userPanel) userPanel.style.display = 'block';

            if(document.getElementById('user-name')) document.getElementById('user-name').innerText = user.displayName;
            if(document.getElementById('user-email')) document.getElementById('user-email').innerText = user.email;
            if(document.getElementById('user-pic')) {
                document.getElementById('user-pic').src = user.photoURL;
                document.getElementById('user-pic').style.display = 'block';
            }
            const placeholder = document.querySelector('.user-placeholder');
            if(placeholder) placeholder.style.display = 'none';

            syncFavorites(user.uid);
            loadOrderHistory(user.email); 
        } else {
            currentUser = null;
            const guestPanel = document.getElementById('auth-guest');
            const userPanel = document.getElementById('auth-user');
            if(guestPanel) guestPanel.style.display = 'block';
            if(userPanel) userPanel.style.display = 'none';
            
            favorites = JSON.parse(localStorage.getItem('favorites')) || [];
            renderGrid(allProducts); 
        }
    });
}

function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert("Login failed."));
}

function logout() {
    auth.signOut().then(() => location.reload());
}

/* ===============================
   REAL ORDER HISTORY LOGIC
=============================== */
function loadOrderHistory(email) {
    const container = document.getElementById('order-history-list');
    if(!container) return;
    
    container.innerHTML = "<p style='color:#666; text-align:center; margin-top:20px;'>Loading orders...</p>";

    db.collection("orders").where("userEmail", "==", email).orderBy("timestamp", "desc").get()
    .then(snap => {
        container.innerHTML = "";
        if(snap.empty) {
            container.innerHTML = `
                <div style="text-align:center; color:#888; padding:20px;">
                    <p>No orders linked to ${email}</p>
                    <small>If you placed an order as Guest, use the Track tab.</small>
                </div>`;
            return;
        }

        snap.forEach(doc => {
            const o = doc.data();
            const date = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : 'N/A';
            const statusColor = o.status === 'Shipped' ? '#C5A059' : (o.status === 'Delivered' ? '#25D366' : '#fff');
            
            container.innerHTML += `
                <div class="w-item" style="display:block; cursor:default;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <strong style="color:#C5A059;">${o.trackingId || '#' + doc.id.slice(0,8).toUpperCase()}</strong>
                        <span style="color:${statusColor}; font-size:0.8rem;">${o.status}</span>
                    </div>
                    <p style="color:#ccc; font-size:0.85rem; margin:0;">${o.product}</p>
                    <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.8rem; color:#888;">
                        <span>${date}</span>
                        <span>₹${o.price}</span>
                    </div>
                </div>
            `;
        });
    }).catch(err => {
        console.error("Order load error:", err);
        if(err.code === 'failed-precondition') {
             container.innerHTML = "<p style='color:#ff4d4d; text-align:center; font-size:0.8rem;'>System Indexing... Check back in 5 mins.</p>";
        }
    });
}

/* ===============================
   FAVORITES
=============================== */
function syncFavorites(uid) {
    db.collection('customers').doc(uid).get().then(doc => {
        let cloudFavs = [];
        if (doc.exists && doc.data().favorites) cloudFavs = doc.data().favorites;
        favorites = [...new Set([...favorites, ...cloudFavs])];
        localStorage.setItem('favorites', JSON.stringify(favorites));
        db.collection('customers').doc(uid).set({ favorites: favorites }, { merge: true });
        renderGrid(allProducts);
        renderWishlist();
    });
}

function toggleFav(e, id) {
    e.stopPropagation(); 
    const index = favorites.indexOf(id);
    if (index > -1) favorites.splice(index, 1); 
    else favorites.push(id); 
    localStorage.setItem('favorites', JSON.stringify(favorites));
    if (currentUser) db.collection('customers').doc(currentUser.uid).set({ favorites: favorites }, { merge: true });
    
    // Update UI Button
    const btn = document.getElementById(`fav-btn-${id}`);
    if(btn) {
        btn.classList.toggle('active');
        btn.style.background = btn.classList.contains('active') ? '#C5A059' : 'rgba(0,0,0,0.6)';
    }
    
    // Update Drawer if open
    if(document.getElementById('account-drawer').classList.contains('open')) renderWishlist();
}

function renderWishlist() {
    const container = document.getElementById('wishlist-items');
    if(!container) return;
    
    container.innerHTML = "";
    if (favorites.length === 0) {
        container.innerHTML = "<p style='color:#666; text-align:center;'>Your favourites list is empty.</p>";
        return;
    }
    favorites.forEach(id => {
        const product = allProducts.find(p => p.id === id);
        if (product) {
            let img = product.img || (product.images ? product.images[0] : '');
            container.innerHTML += `
                <div class="w-item" onclick="window.location.href='product.html?id=${product.id}'">
                    <img src="${img}" class="w-img">
                    <div class="w-info"><h4>${product.name}</h4><p>₹${product.price}</p></div>
                    <button class="w-btn" onclick="toggleFav(event, '${product.id}'); renderWishlist();">✕</button>
                </div>`;
        }
    });
}

/* ===============================
   UI DRAWERS & TABS
=============================== */
function openAccountDrawer() {
    document.getElementById('account-overlay').classList.add('open');
    document.getElementById('account-drawer').classList.add('open');
    renderWishlist();
}

function closeAccountDrawer() {
    document.getElementById('account-overlay').classList.remove('open');
    document.getElementById('account-drawer').classList.remove('open');
}

function switchTab(tabName) {
    document.querySelectorAll('.acc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.acc-section').forEach(s => s.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('tab-' + tabName).classList.add('active');
}

function miniTrack() {
    const id = document.getElementById('mini-track-input').value;
    if(id) window.location.href = `tracker.html?id=${id}`;
}

/* ===============================
   PRODUCT GRID LOADING
=============================== */
function loadProducts() {
    const grid = document.getElementById("product-grid");
    if(!grid) return; // Exit if not on shop page

    db.collection("products").orderBy("timestamp", "desc").get().then((querySnapshot) => {
        allProducts = [];
        querySnapshot.forEach((doc) => { allProducts.push({ id: doc.id, ...doc.data() }); });
        
        const params = new URLSearchParams(window.location.search);
        const searchQuery = params.get('q'); 
        let filtered = allProducts;
        
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            filtered = allProducts.filter(p => (p.name && p.name.toLowerCase().includes(lowerQ)) || (p.category && p.category.toLowerCase().includes(lowerQ)));
            document.getElementById("collection-title").innerText = `Results for "${searchQuery}"`;
        }
        updateCartCount(); 
        renderGrid(filtered);
    });
}

function renderGrid(products) {
    const grid = document.getElementById("product-grid");
    if(!grid) return;
    
    grid.innerHTML = "";
    if(products.length === 0) {
        grid.innerHTML = "<p style='grid-column:1/-1; text-align:center; padding:50px; color:#888;'>No products found.</p>";
        return;
    }
    products.forEach(product => {
        let displayImg = product.img;
        if(product.images && product.images.length > 0) displayImg = product.images[0];
        const isFav = favorites.includes(product.id) ? 'active' : '';
        let cardClass = 'product-card';
        let soldBadge = product.soldOut ? '<div class="sold-badge">SOLD OUT</div>' : '';
        if (product.soldOut) cardClass += ' sold-item';
        
        grid.innerHTML += `
            <div class="${cardClass}" onclick="window.location.href='product.html?id=${product.id}'">
                <div class="p-img-container">
                    <img src="${displayImg}" alt="${product.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
                    ${product.sale ? '<div class="sale-badge">SALE</div>' : ''}
                    ${soldBadge}
                    <div id="fav-btn-${product.id}" class="fav-btn-card ${isFav}" onclick="toggleFav(event, '${product.id}')">♥</div>
                </div>
                <div class="p-info">
                    <h3 style="margin:0; color:white;">${product.name}</h3>
                    <p style="margin:5px 0 0 0; color:#C5A059;">₹${Number(product.price).toLocaleString()}</p>
                </div>
            </div>
        `;
    });
}

/* ===============================
   UTILITIES
=============================== */
function checkAnnouncement() {
    db.collection('settings').doc('announcement').get().then(doc => {
        if (doc.exists && doc.data().isActive) {
            const bar = document.getElementById('announcement-bar');
            const textSpan = document.getElementById('announcement-text');
            const rawText = doc.data().text;
            const messages = rawText.split('|').map(t => t.trim());
            if(bar) bar.style.display = 'flex';
            document.body.classList.add('has-banner');
            let msgIndex = 0;
            function cycleText() {
                textSpan.classList.remove('active');
                setTimeout(() => {
                    textSpan.innerText = messages[msgIndex];
                    msgIndex = (msgIndex + 1) % messages.length; 
                    textSpan.classList.add('active');
                }, 800); 
            }
            cycleText(); 
            if(messages.length > 1) setInterval(cycleText, 4000); 
        }
    });
}

function highlightActiveCategory() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (!q) { 
        const btn = document.getElementById('btn-all');
        if(btn) btn.classList.add('active'); 
    } else { 
        const target = document.getElementById(`btn-${q}`); 
        if(target) target.classList.add('active'); 
    }
}

function runSearch() {
    const query = document.getElementById('global-search').value;
    if(query) window.location.href = `shop.html?q=${encodeURIComponent(query)}`;
}

/* ===============================
   CART DRAWER LOGIC
=============================== */
function openCartDrawer() {
    const container = document.getElementById('drawer-items');
    if(!container) return;

    container.innerHTML = "";
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    let subtotal = 0;
    if(cart.length === 0) {
        container.innerHTML = "<p style='color:#666; text-align:center; margin-top:50px;'>Your bag is empty.</p>";
        updatePrices(0);
    } else {
        const counts = {};
        cart.forEach(id => counts[id] = (counts[id] || 0) + 1);
        Object.keys(counts).forEach(id => {
            const product = allProducts.find(p => p.id === id);
            if(product) {
                const itemTotal = Number(product.price) * counts[id];
                subtotal += itemTotal;
                let displayImg = product.img || (product.images ? product.images[0] : '');
                container.innerHTML += `
                    <div class="c-item">
                        <img src="${displayImg}" class="c-img">
                        <div class="c-details">
                            <div><h4 class="c-name">${product.name}</h4><span class="c-price">₹${Number(product.price).toLocaleString()}</span></div>
                            <div class="c-controls">
                                <div class="qty-mini">
                                    <button onclick="modifyCart('${id}', -1)">-</button><span>${counts[id]}</span><button onclick="modifyCart('${id}', 1)">+</button>
                                </div>
                                <button class="del-btn" onclick="removeFromCart('${id}')">✕</button>
                            </div>
                        </div>
                    </div>`;
            }
        });
        updatePrices(subtotal);
    }
    document.getElementById('cart-overlay').classList.add('open');
    document.getElementById('cart-drawer').classList.add('open');
}

async function applyCoupon() {
    const codeInput = document.getElementById("coupon-code");
    const code = codeInput.value.trim().toUpperCase();
    const msg = document.getElementById("coupon-msg");
    const btn = document.querySelector(".coupon-btn");

    if(!code) return;

    btn.innerText = "...";
    btn.disabled = true;
    msg.style.display = "none";

    try {
        const doc = await db.collection("coupons").doc(code).get();
        
        if(doc.exists) {
            const data = doc.data();
            appliedDiscount = data.percent;
            msg.innerText = `✓ ${code} Applied! (${appliedDiscount}% OFF)`;
            msg.style.color = "#25D366";
            msg.style.display = "block";
        } else {
            appliedDiscount = 0;
            msg.innerText = "❌ Invalid Coupon Code";
            msg.style.color = "#ff4d4d";
            msg.style.display = "block";
        }
    } catch (error) {
        console.error("Coupon check failed", error);
        msg.innerText = "Error checking coupon";
        msg.style.color = "#ff4d4d";
        msg.style.display = "block";
    }

    btn.innerText = "APPLY";
    btn.disabled = false;
    openCartDrawer(); 
}

function updatePrices(subtotal) {
    const subDisplay = document.getElementById("subtotal-price");
    if(subDisplay) subDisplay.innerText = "₹" + subtotal.toLocaleString();
    
    if(appliedDiscount > 0) {
        const discountVal = (subtotal * appliedDiscount) / 100;
        document.getElementById("discount-row").style.display = "flex";
        document.getElementById("discount-amount").innerText = "-₹" + discountVal.toLocaleString();
        document.getElementById("drawer-total").innerText = "₹" + (subtotal - discountVal).toLocaleString();
        localStorage.setItem("cart_discount_percent", appliedDiscount);
    } else {
        document.getElementById("discount-row").style.display = "none";
        document.getElementById("drawer-total").innerText = "₹" + subtotal.toLocaleString();
        localStorage.setItem("cart_discount_percent", 0);
    }
}

function closeCartDrawer() {
    document.getElementById('cart-overlay').classList.remove('open');
    document.getElementById('cart-drawer').classList.remove('open');
}

function modifyCart(id, change) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    if(change === 1) cart.push(id);
    else { const index = cart.indexOf(id); if(index > -1) cart.splice(index, 1); }
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    openCartDrawer();
}

function removeFromCart(id) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart = cart.filter(itemId => itemId !== id);
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    openCartDrawer();
}

function updateCartCount() {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    const count = cart.length;
    const badge = document.getElementById("cart-count");
    const barBadge = document.getElementById("cart-count-bar");
    if(badge) badge.innerText = count;
    if(barBadge) barBadge.innerText = count;
}

function goToCheckout() {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    if(cart.length === 0) return alert("Cart is empty");
    localStorage.setItem("checkout_type", "cart");
    window.location.href = "checkout.html";
}
