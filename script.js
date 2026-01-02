/* ===============================
  Panun Poshak - Store Script (FIXED & ROBUST)
=============================== */

// STATE
let products = [];
let cart = JSON.parse(localStorage.getItem("cart")) || [];
let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
let currentUser = null;
let selectedCategory = "all";

// FIREBASE INIT (Safety Check)
let db, auth;
try {
    if (typeof firebase !== "undefined") {
        db = firebase.firestore();
        auth = firebase.auth();
    } else {
        console.error("Firebase SDK not loaded. Make sure firebase-app.js is included in your HTML.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

/* ===============================
  LOAD PRODUCTS (With Auto-Cleaner)
=============================== */
async function loadProducts() {
    const loaderText = document.getElementById("loadingText");
    const container = document.getElementById("collection-container");

    // Safety: If there is no container (e.g. we are on checkout page), stop here.
    if (!container) return; 

    try {
        if (loaderText) loaderText.innerText = "Loading Collection...";

        if (!db) throw new Error("Database not initialized");

        const snap = await db.collection("products").orderBy("timestamp", "desc").get();
        products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const validCart = cart.filter(cartId => products.some(p => p.id === cartId));

        if (validCart.length !== cart.length) {
            console.log("Removed invalid items from cart.");
            cart = validCart;
            localStorage.setItem("cart", JSON.stringify(cart));
            updateCartCount();
        }

        if (loaderText) loaderText.style.display = "none";
        displayProducts(products);

    } catch (err) {
        if (loaderText) loaderText.innerText = "Error loading products.";
        console.error("Load Products Error:", err);
    }
}

/* NEW FUNCTION – return qty of product in cart */
function getCartQty(id) {
    return cart.filter(x => x === id).length;
}

function displayProducts(list) {
    const container = document.getElementById("collection-container");
    if (!container) return; // Stop if container doesn't exist

    container.innerHTML = "";

    list.forEach(item => {
        let badgeHTML = "";
        let opacityStyle = "";
        let clickAction = `onclick="viewProduct('${item.id}')"`;
        let buttonGroup = "";

        if (item.soldOut) {
            badgeHTML = '<span class="badge sold-out">Sold Out</span>';
            opacityStyle = "opacity: 0.6; filter: grayscale(100%); pointer-events: none;";
            clickAction = "";
            buttonGroup = `
            <button class="btn" style="width:100%; background:#222; color:#ff4d4d; border:1px solid #444; cursor:not-allowed;">
                🚫 SOLD OUT
            </button>
        `;
        } else {
            const qty = getCartQty(item.id);

            if (item.sale) {
                badgeHTML = '<span class="badge sale">SALE</span>';
            }

            if (qty > 0) {
                buttonGroup = `
            <div style="display:flex;align-items:center;gap:10px;justify-content:center;width:100%;">
                <button onclick="adjustQty('${item.id}', -1)" class="qty-btn" style="padding:5px 10px;border:1px solid #888;background:none;color:white;">-</button>
                <span style="color:white;font-weight:bold;">${qty}</span>
                <button onclick="adjustQty('${item.id}', 1)" class="qty-btn" style="padding:5px 10px;border:1px solid #888;background:none;color:white;">+</button>
            </div>
            <button onclick="viewProduct('${item.id}')" class="btn" style="flex:1;">Buy Now</button>
          `;
            } else {
                buttonGroup = `
            <button onclick="addToCart('${item.id}')" class="btn" style="flex:1;">Add to Bag</button>
            <button onclick="viewProduct('${item.id}')" class="btn" style="flex:1;">Buy Now</button>
          `;
            }
        }

        const isFav = favorites.includes(item.id) ? 'active' : '';

        container.innerHTML += `
      <div class="product-card">
        <div class="img-container" style="${opacityStyle}">
            ${badgeHTML}
            <img src="${item.img}" class="product-img" ${clickAction}>
        </div>
        
        <div class="product-info">
            <h3>${item.name}</h3>
            <p class="price">₹${item.price}</p>
            
            <div style="display:flex; justify-content:center; gap:10px; margin-top:10px;">
                ${buttonGroup}
                <button onclick="toggleFav('${item.id}')" class="fav-btn ${isFav}">♥</button>
            </div>
        </div>
      </div>
    `;
    });
}

/* ===============================
   CATEGORY FILTER
=============================== */
function filterCategory(cat) {
    selectedCategory = cat;
    const container = document.getElementById("collection-container");

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(cat)) {
            btn.classList.add('active');
        }
    });

    let filtered = [];
    if (cat === 'all') {
        filtered = products;
    } else if (cat === 'wishlist') {
        filtered = products.filter(p => favorites.includes(p.id));
    } else {
        filtered = products.filter(p => p.category === cat);
    }

    displayProducts(filtered);

    // Only update innerHTML if container exists
    if (container && filtered.length === 0) {
        container.innerHTML = `
        <div style="text-align:center; padding:40px; width:100%; grid-column:1/-1;">
            <p style="color:#888; font-size:1.2rem;">${cat === 'wishlist' ? "Your wishlist is empty. 💔" : "No products found."}</p>
            <button onclick="filterCategory('all')" class="btn" style="margin-top:10px;">Browse Shop</button>
        </div>`;
    }
}

/* ===============================
  FAVORITES
=============================== */
function toggleFav(id) {
    favorites.includes(id) ?
        favorites = favorites.filter(f => f !== id) :
        favorites.push(id);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    filterCategory(selectedCategory);
}

/* ===============================
  VIEW PRODUCT (Redirects)
=============================== */
function viewProduct(id) {
    window.location.href = "product.html?id=" + id;
}

/* ===============================
  CART SYSTEM
=============================== */
function updateCartCount() {
    const cartCount = document.getElementById("cart-count-bar");
    if (cartCount) cartCount.innerText = cart.length;
}

/* MODIFIED — refresh UI after add */
function addToCart(id) {
    cart.push(id);
    saveAndRefreshCart();
    if (selectedCategory) filterCategory(selectedCategory);
    else displayProducts(products);
}

/* ===============================
   PREMIUM CART LOGIC (Grouped)
=============================== */
function openCart() {
    const modal = document.getElementById("cartModal");
    const body = document.getElementById("cart-body");

    // SAFETY CHECK: If modal doesn't exist on this page, stop.
    if (!modal || !body) return;

    modal.style.display = "flex";
    body.innerHTML = "";

    if (cart.length === 0) {
        body.innerHTML = '<p style="text-align:center; color:#888; margin-top:50px;">Your bag is empty.</p>';
        return;
    }

    const cartCounts = {};
    cart.forEach(id => {
        cartCounts[id] = (cartCounts[id] || 0) + 1;
    });

    let total = 0;

    Object.keys(cartCounts).forEach(id => {
        const p = products.find(x => x.id === id);
        const qty = cartCounts[id];

        if (p) {
            const itemTotal = Number(p.price) * qty;
            total += itemTotal;
            const imgSrc = p.img || p.image || 'https://via.placeholder.com/50';

            body.innerHTML += `
            <div class="cart-item-row">
                <img src="${imgSrc}" class="cart-img">
                
                <div class="cart-info">
                    <h4>${p.name}</h4>
                    <div class="item-price">₹${Number(p.price).toLocaleString()}</div>
                </div>

                <div class="qty-wrapper">
                    <button onclick="adjustQty('${id}', -1)" class="qty-btn">-</button>
                    <span class="qty-count">${qty}</span>
                    <button onclick="adjustQty('${id}', 1)" class="qty-btn">+</button>
                </div>

                <button onclick="removeItemCompletely('${id}')" class="remove-btn-icon">&times;</button>
            </div>
          `;
        }
    });

    body.innerHTML += `
      <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px dashed #555;">
          <h3 style="color: white; margin-bottom: 15px; font-family:'Playfair Display',serif;">
              Total: <span style="color: #C5A059;">₹${total.toLocaleString()}</span>
          </h3>
          <button onclick="checkoutFromCart(${total})" 
                  class="track-btn" style="background:#C5A059; color:black; width:100%; font-weight:bold;">
              CHECKOUT NOW
          </button>
      </div>
  `;
}

function adjustQty(id, amount) {
    if (amount > 0) cart.push(id);
    else {
        const index = cart.indexOf(id);
        if (index > -1) cart.splice(index, 1);
    }
    saveAndRefreshCart();

    // Refresh shop UI instantly
    filterCategory(selectedCategory);
}

function removeItemCompletely(id) {
    cart = cart.filter(itemId => itemId !== id);
    saveAndRefreshCart();
}

function saveAndRefreshCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    openCart();
}

/* ===============================
  CHECKOUT FROM CART
=============================== */
function checkoutFromCart(totalAmount) {
    localStorage.setItem("checkout_type", "cart");
    window.location.href = "checkout.html";
}

/* ===============================
  AUTH & UI LOGIC
=============================== */
const ADMIN_EMAIL = "poshakpanun@gmail.com";

// Only run Auth listener if auth is initialized
if (auth) {
    auth.onAuthStateChanged((user) => {
        currentUser = user;

        const loginBtn = document.getElementById("login-btn");
        const avatar = document.getElementById("user-avatar");

        if (user) {
            if (loginBtn) loginBtn.style.display = "none";
            if (avatar) {
                avatar.style.display = "block";
                avatar.src = user.photoURL;
            }
        } else {
            if (loginBtn) loginBtn.style.display = "block";
            if (avatar) avatar.style.display = "none";
        }

        if (window.location.pathname.includes("admin.html")) {
            if (!user || user.email !== ADMIN_EMAIL) {
                window.location.href = "admin-login.html";
            }
        }
    });
}

function googleLogin() {
    if (!auth) return alert("Auth system not loaded.");
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            db.collection("customers").doc(user.email).set({
                name: user.displayName,
                email: user.email,
                photo: user.photoURL,
                lastSeen: new Date().toISOString()
            }, {
                merge: true
            });
            alert("Welcome, " + user.displayName + "! 👋");
        })
        .catch((error) => {
            console.error(error);
            alert("Login Failed: " + error.message);
        });
}

function googleLogout() {
    if (confirm("Do you want to logout?")) {
        auth.signOut().then(() => {
            alert("Logged out.");
            window.location.reload();
        });
    }
}

/* ===============================
  CURSOR & INIT
=============================== */
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Initialize Cart Count on load
    updateCartCount();

    // 2. Initialize Cursor
    const cursorDot = document.getElementById("cursor-dot");
    const cursorOutline = document.getElementById("cursor-outline");
    if (cursorDot && cursorOutline) {
        window.addEventListener("mousemove", (e) => {
            cursorDot.style.top = `${e.clientY}px`;
            cursorDot.style.left = `${e.clientX}px`;
            cursorOutline.animate({
                top: `${e.clientY}px`,
                left: `${e.clientX}px`
            }, {
                duration: 200,
                fill: "forwards"
            });
        });
    }

    // 3. Load Products ONLY on specific pages
    if (window.location.pathname.includes("index") ||
        window.location.pathname.includes("shop") ||
        window.location.pathname === "/" ||
        window.location.pathname.endsWith("/")) {
        loadProducts();
    }
});

/* ===============================
   VIP POPUP LOGIC
=============================== */
function openAccount() {
    if (!currentUser) return alert("Please log in first!");
    
    const accountModal = document.getElementById("accountModal");
    if(!accountModal) return; // Safety check

    accountModal.style.display = "flex";
    document.getElementById("modal-name").innerText = currentUser.displayName;
    document.getElementById("modal-email").innerText = currentUser.email;
    document.getElementById("modal-avatar").src = currentUser.photoURL;

    const list = document.getElementById("modal-orders-list");
    list.innerHTML = '<p style="color:#888; text-align:center; padding:10px;">Checking records...</p>';

    if (!db) return;

    db.collection("orders")
        .where("customer.email", "==", currentUser.email)
        .orderBy("timestamp", "desc")
        .get()
        .then((snap) => {
            list.innerHTML = "";
            if (snap.empty) {
                list.innerHTML = '<p style="text-align:center; font-size:0.8rem; color:#666;">No orders found yet.</p>';
                return;
            }
            snap.forEach(doc => {
                const o = doc.data();
                let color = o.status === "Delivered" ? "#25D366" : (o.status === "Shipped" ? "#C5A059" : "#888");

                list.innerHTML += `
                  <div class="mini-order-card">
                      <div>
                          <div style="color:white; font-size:0.9rem; font-weight:bold;">${o.product || "Collection"}</div>
                          <div style="color:#666; font-size:0.7rem;">#${doc.id.slice(0,6).toUpperCase()}</div>
                      </div>
                      <div style="text-align:right;">
                          <div style="color:#C5A059;">₹${o.price}</div>
                          <div style="color:${color}; font-size:0.7rem;">● ${o.status || "Pending"}</div>
                      </div>
                  </div>
              `;
            });
        });
}

function closeAccount() {
    const accountModal = document.getElementById("accountModal");
    if(accountModal) accountModal.style.display = "none";
}
