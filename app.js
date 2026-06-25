
let shoppingBag = [];
let savedCollection = [];
let currentVerifiedProfile = null;
let simulatedOTPCode = null;
let currentStockCounterValue = 5;
let databaseInventoryCache = [];
let lastReceiptData = null;
let adminSelectedImageBase64 = null;
let selectedRatings = {};


document.addEventListener("DOMContentLoaded", () => {
    initializeNavigationListeners();
    loadStorefrontProducts();
    initializeWishlistStorage();
    checkAdminHashTrigger();

    const savedToken = localStorage.getItem('esthyceeToken');
    if (savedToken) {
        fetch('http://localhost:5000/api/auth/me', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${savedToken}`, 'Content-Type': 'application/json' }
        })
        .then(r => { if (r.status === 401) throw new Error('Unauthorized'); return r.json(); })
        .then(data => {
            if (data.success) {
                currentVerifiedProfile = data.user;
                shoppingBag = data.user.shoppingBag || [];
                evaluateGatekeeperState();
                refreshShoppingBagUI();
                triggerToastNotification(`Welcome back, ${currentVerifiedProfile.name}`);
            } else { localStorage.removeItem('esthyceeToken'); evaluateGatekeeperState(); }
        })
        .catch(() => { localStorage.removeItem('esthyceeToken'); evaluateGatekeeperState(); });
    } else { evaluateGatekeeperState(); }
});


window.addEventListener("hashchange", () => {
    if (window.location.hash === "#staffportal") {
        history.replaceState(null, '', window.location.pathname);
        setTimeout(() => openAdminPortal(), 400);
    }
});

function openAdminPortal() {
    const passkey = prompt("Enter Administration Secure Portal Key Code:");
    if (passkey === "esthycee2026") {
        switchView("admin");
    } else if (passkey !== null) {
        triggerToastNotification("Access Denied. Identity signature match missing.");
    }
}


function initializeNavigationListeners() {
    const menuBtn = document.getElementById("menuBtn");
    const closeDrawerBtn = document.getElementById("closeDrawerBtn");
    const sidebarDrawer = document.getElementById("sidebarDrawer");
    const drawerContent = document.getElementById("drawerContent");
    const cartBtn = document.getElementById("cartBtn");
    const closeCartBtn = document.getElementById("closeCartBtn");
    const cartDrawer = document.getElementById("cartDrawer");
    const themeToggle = document.getElementById("themeToggle");

    menuBtn.addEventListener("click", () => {
        sidebarDrawer.classList.remove("opacity-0", "pointer-events-none");
        drawerContent.classList.remove("-translate-x-full");
    });
    const closeDrawer = () => {
        sidebarDrawer.classList.add("opacity-0", "pointer-events-none");
        drawerContent.classList.add("-translate-x-full");
    };
    closeDrawerBtn.addEventListener("click", closeDrawer);
    sidebarDrawer.addEventListener("click", e => { if (e.target === sidebarDrawer) closeDrawer(); });
    cartBtn.addEventListener("click", () => {
        if (!currentVerifiedProfile) { triggerToastNotification("Please login to access the shopping bag."); switchView("account"); return; }
        cartDrawer.classList.remove("translate-x-full");
    });
    closeCartBtn.addEventListener("click", () => cartDrawer.classList.add("translate-x-full"));
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        const isDark = document.body.classList.contains("dark");
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        triggerToastNotification(isDark ? "Midnight Plum Mode Engaged" : "Classic Luxury Mode Engaged");
    });
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'E') { e.preventDefault(); openAdminPortal(); }
    });
}

function switchView(targetViewId) {
    document.querySelectorAll(".app-view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`view-${targetViewId}`).classList.remove("hidden");
    document.getElementById("sidebarDrawer").classList.add("opacity-0", "pointer-events-none");
    document.getElementById("drawerContent").classList.add("-translate-x-full");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (targetViewId === "account") {
        if (currentVerifiedProfile) {
            ["authContainer","otpContainer","recoveryContainer","deleteAccountContainer"].forEach(id => document.getElementById(id).classList.add("hidden"));
            document.getElementById("profileContainer").classList.remove("hidden");
            document.getElementById("profileName").innerText = currentVerifiedProfile.name || "";
            document.getElementById("profileEmailInput").value = currentVerifiedProfile.contact || "";
            document.getElementById("profilePhoneInput").value = currentVerifiedProfile.phone || "";
            document.getElementById("profileCountryInput").value = currentVerifiedProfile.country || "Nigeria";
            document.getElementById("profileAddressInput").value = currentVerifiedProfile.address || "";
        } else {
            document.getElementById("authContainer").classList.remove("hidden");
            document.getElementById("profileContainer").classList.add("hidden");
            document.getElementById("deleteAccountContainer").classList.add("hidden");
        }
    }
    if (targetViewId === "inbox") loadOrderLedger();
    if (targetViewId === "admin") renderAdminInventoryControl();
    if (targetViewId === "wishlist") renderSavedCollectionUI();
}

function evaluateGatekeeperState() {
    const gk = document.getElementById("storefrontGatekeeper");
    const lb = document.getElementById("footerLogoutContainer");
    if (currentVerifiedProfile) {
        if (gk) gk.classList.add("hidden");
        if (lb) lb.classList.remove("hidden");
    } else {
        if (gk) gk.classList.remove("hidden");
        if (lb) lb.classList.add("hidden");
    }
}


function togglePasswordVisibility(inputFieldId, iconEl) {
    const f = document.getElementById(inputFieldId);
    if (!f) return;
    f.type = f.type === "password" ? "text" : "password";
    iconEl.innerHTML = f.type === "password" ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
}

function handleAuthSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("authName").value.trim();
    const contact = document.getElementById("authContact").value.trim();
    const phone = document.getElementById("authPhone").value.trim();
    const country = document.getElementById("authCountry").value;
    const address = document.getElementById("authAddress").value.trim();
    const password = document.getElementById("authPassword").value;
    if (!name || !contact || !phone || !address || !password) { triggerToastNotification("Please complete all verification matrix fields."); return; }
    document.getElementById("authSubmitBtn").innerText = "Connecting Security Node...";
    fetch('http://localhost:5000/api/auth/sync-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, phone, country, address, password })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('esthyceeToken', data.token);
            currentVerifiedProfile = data.user;
            shoppingBag = data.user.shoppingBag || [];
            if (data.requiresOTP) {
                simulatedOTPCode = data.simulatedCodeField;
                document.getElementById("authContainer").classList.add("hidden");
                document.getElementById("otpContainer").classList.remove("hidden");
                const n = document.getElementById("otpNoticeMessage");
                if (n) n.innerText = "🔒 Secure access passkey dispatched to your email inbox.";
                startOTPDurationCountdown();
            } else { completeProfileActivation(); switchView('account'); }
        } else {
            triggerToastNotification(data.message || "Check your email and password and try again.");
            document.getElementById("authSubmitBtn").innerText = "Secure Access";
        }
    })
    .catch(() => { triggerToastNotification("Authentication failed."); document.getElementById("authSubmitBtn").innerText = "Secure Access"; });
}

function startOTPDurationCountdown() {
    let t = 120;
    const el = document.getElementById("otpCountdownClock");
    clearInterval(window.otpIntervalDriver);
    window.otpIntervalDriver = setInterval(() => {
        if (el) el.innerText = `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;
        if (--t < 0) { clearInterval(window.otpIntervalDriver); triggerToastNotification("Verification window expired."); resetAuthFlow(); }
    }, 1000);
}

function confirmOTPCode() {
    if (document.getElementById("otpInputField").value.trim() === simulatedOTPCode) {
        clearInterval(window.otpIntervalDriver); completeProfileActivation();
    } else triggerToastNotification("Security code mismatch error.");
}

function revealRecoveryInterface() {
    document.getElementById("authContainer").classList.add("hidden");
    document.getElementById("otpContainer").classList.add("hidden");
    document.getElementById("recoveryContainer").classList.remove("hidden");
    document.getElementById("recoveryEmailBlock").classList.remove("hidden");
    document.getElementById("recoveryResetBlock").classList.add("hidden");
    document.getElementById("recoveryStatusNotice").innerText = "Provide your registered email to start recovery.";
    document.getElementById("recoveryEmailField").value = "";
}

function abortRecoveryWorkflow() {
    clearInterval(window.recoveryIntervalDriver);
    document.getElementById("recoveryContainer").classList.add("hidden");
    document.getElementById("authContainer").classList.remove("hidden");
}

function submitForgotPasswordRequest() {
    const email = document.getElementById("recoveryEmailField").value.trim();
    if (!email) { triggerToastNotification("Please enter your registered email."); return; }
    triggerToastNotification("Routing recovery token...");
    fetch('http://localhost:5000/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: email })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            document.getElementById("recoveryEmailBlock").classList.add("hidden");
            document.getElementById("recoveryResetBlock").classList.remove("hidden");
            document.getElementById("recoveryStatusNotice").innerText = "🔒 Reset token sent to your inbox.";
            startRecoveryDurationCountdown();
        } else triggerToastNotification(data.message || "Failed to initiate recovery.");
    }).catch(() => triggerToastNotification("Recovery link failure."));
}

function startRecoveryDurationCountdown() {
    let t = 120;
    const el = document.getElementById("recoveryCountdownClock");
    clearInterval(window.recoveryIntervalDriver);
    window.recoveryIntervalDriver = setInterval(() => {
        if (el) el.innerText = `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;
        if (--t < 0) { clearInterval(window.recoveryIntervalDriver); triggerToastNotification("Recovery token expired."); abortRecoveryWorkflow(); }
    }, 1000);
}

function submitPasswordRewriteVerification() {
    const email = document.getElementById("recoveryEmailField").value.trim();
    const token = document.getElementById("recoveryOTPField").value.trim();
    const newPassword = document.getElementById("recoveryNewPasswordField").value;
    if (!token || !newPassword) { triggerToastNotification("Please complete all reset fields."); return; }
    fetch('http://localhost:5000/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: email, token, newPassword })
    }).then(r => r.json()).then(data => {
        if (data.success) { clearInterval(window.recoveryIntervalDriver); triggerToastNotification("Password reset successfully!"); abortRecoveryWorkflow(); }
        else triggerToastNotification(data.message || "Verification failed.");
    }).catch(() => triggerToastNotification("Error processing reset."));
}

function completeProfileActivation() {
    ["authContainer","otpContainer","recoveryContainer"].forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById("profileContainer").classList.remove("hidden");
    document.getElementById("profileName").innerText = currentVerifiedProfile.name;
    document.getElementById("profileEmailInput").value = currentVerifiedProfile.contact || "";
    document.getElementById("profilePhoneInput").value = currentVerifiedProfile.phone || "";
    document.getElementById("profileCountryInput").value = currentVerifiedProfile.country || "Nigeria";
    document.getElementById("profileAddressInput").value = currentVerifiedProfile.address || "";
    document.getElementById("profileMeta").innerText = `SYSTEM ACTIVE: ${currentVerifiedProfile.country} DEPLOYMENT NODE`;
    evaluateGatekeeperState(); refreshShoppingBagUI();
    triggerToastNotification("Profile tracking synced successfully!");
    setTimeout(() => switchView("storefront"), 1500);
}

function triggerAccountParameterModification() {
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    const updatedEmail = document.getElementById("profileEmailInput").value.trim();
    const updatedPhone = document.getElementById("profilePhoneInput").value.trim();
    const updatedCountry = document.getElementById("profileCountryInput").value;
    const updatedAddress = document.getElementById("profileAddressInput").value.trim();
    const emailChanged = updatedEmail !== currentVerifiedProfile.contact;
    const phoneChanged = updatedPhone !== currentVerifiedProfile.phone;
    fetch('http://localhost:5000/api/auth/update-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ contact: updatedEmail, phone: updatedPhone, country: updatedCountry, address: updatedAddress })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            currentVerifiedProfile = data.user;
    
            if (data.token) localStorage.setItem('esthyceeToken', data.token);
            document.getElementById("profileMeta").innerText = `SYSTEM ACTIVE: ${currentVerifiedProfile.country} DEPLOYMENT NODE`;
            loadStorefrontProducts(); refreshShoppingBagUI();
            if ((emailChanged || phoneChanged) && data.requiresOTP) {
                simulatedOTPCode = data.simulatedCodeField;
                document.getElementById("profileContainer").classList.add("hidden");
                document.getElementById("otpContainer").classList.remove("hidden");
                const n = document.getElementById("otpNoticeMessage");
                if (n) n.innerText = "🔒 Verification code sent to confirm change.";
                startOTPDurationCountdown();
            } else triggerToastNotification("Profile saved.");
        } else triggerToastNotification(data.message || data.error || "Could not update profile.");
    }).catch(() => triggerToastNotification("Network timeout saving profile."));
}

function revealDeleteAccountWorkflow() {
    if (!confirm("Listen, this is no trial and error kind of thing.\n\nIf you delete your account, it is permanently gone.\n\nAre you sure?")) return;
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    triggerToastNotification("Sending deletion code to your email...");
    fetch("http://localhost:5000/api/auth/request-delete-account", {
        method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    }).then(r => r.json()).then(data => {
        if (data.success) {
            triggerToastNotification("Verification code sent. Check your email.");
            document.getElementById("profileContainer").classList.add("hidden");
            document.getElementById("deleteAccountContainer").classList.remove("hidden");
        } else triggerToastNotification("Error: " + data.message);
    }).catch(() => triggerToastNotification("Unable to send deletion code."));
}

function abortDeleteAccountWorkflow() {
    document.getElementById("deleteAccountContainer").classList.add("hidden");
    document.getElementById("profileContainer").classList.remove("hidden");
    document.getElementById("deleteAccountConfirmCodeField").value = "";
}


function wipeAllLocalUserData() {
    localStorage.removeItem("esthyceeToken");
    localStorage.removeItem("esthyceeWishlist");
    currentVerifiedProfile = null;
    shoppingBag = [];
    savedCollection = [];
    selectedRatings = {};
    lastReceiptData = null;
}

function executeProfilePurgePipeline() {
    const code = document.getElementById("deleteAccountConfirmCodeField").value.trim();
    if (!code) { triggerToastNotification("Please enter the OTP sent to your email."); return; }
    fetch("http://localhost:5000/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("esthyceeToken")}` },
        body: JSON.stringify({ otp: code })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            document.getElementById("deleteAccountContainer").classList.add("hidden");
            document.getElementById("deleteAccountConfirmCodeField").value = "";
            wipeAllLocalUserData();
            refreshShoppingBagUI();
            renderSavedCollectionUI();
            resetAuthFlow();
            evaluateGatekeeperState();
            switchView("storefront");
            triggerToastNotification("Account permanently deleted. All saved data has been cleared.");
        } else triggerToastNotification(data.message || "Invalid OTP.");
    }).catch(() => triggerToastNotification("Server error deleting account."));
}

function resetAuthFlow() {
    clearInterval(window.otpIntervalDriver); clearInterval(window.recoveryIntervalDriver);
    simulatedOTPCode = null;
    document.getElementById("authForm").reset();
    document.getElementById("authSubmitBtn").innerText = "Secure Access";
    document.getElementById("authContainer").classList.remove("hidden");
    ["otpContainer","recoveryContainer","profileContainer","deleteAccountContainer"].forEach(id => document.getElementById(id).classList.add("hidden"));
}

function handleLogout() {
    localStorage.removeItem('esthyceeToken');
    currentVerifiedProfile = null; shoppingBag = [];
    refreshShoppingBagUI(); resetAuthFlow(); evaluateGatekeeperState(); switchView("storefront");
    triggerToastNotification("Securely logged out.");
}



function toggleChannelRoutingDrawer() {
    const text = document.getElementById("footerMessageArea").value.trim();
    if (!text) { triggerToastNotification("Please compose your message first."); return; }
    document.getElementById("channelRoutingDrawer").classList.toggle("hidden");
}

function sendMessageViaPipeline(channel) {
    const text = document.getElementById("footerMessageArea").value.trim();
    if (channel === "whatsapp") window.open(`https://wa.me/2348090887714?text=${encodeURIComponent(text)}`, "_blank");
    else window.location.href = `mailto:akpulonuchidinma@gmail.com?subject=${encodeURIComponent("EsthyCee Boutique Enquiry")}&body=${encodeURIComponent(text)}`;
    document.getElementById("channelRoutingDrawer").classList.add("hidden");
}



function initializeWishlistStorage() {
    try { savedCollection = JSON.parse(localStorage.getItem('esthyceeWishlist') || '[]'); }
    catch { savedCollection = []; }
}

function toggleSavedCollectionItem(productId, event) {
    if (event) event.stopPropagation();
 
    const product = databaseInventoryCache.find(i => i._id === productId)
        || savedCollection.find(i => i._id === productId);
    if (!product) return;
    const idx = savedCollection.findIndex(i => i._id === productId);
    if (idx > -1) { savedCollection.splice(idx, 1); triggerToastNotification("Removed from Saved Collection"); }
    else { savedCollection.push(product); triggerToastNotification("Saved to collections"); }
    localStorage.setItem('esthyceeWishlist', JSON.stringify(savedCollection));
    document.querySelectorAll(`.heart-toggle-${productId}`).forEach(btn => {
        btn.classList.toggle("active", idx === -1);
        btn.innerHTML = idx === -1 ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    });
    renderSavedCollectionUI();
}

function renderSavedCollectionUI() {
    const container = document.getElementById("wishlistGrid");
    if (!container) return;
    if (savedCollection.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-14 text-xs opacity-40 font-medium">Your collection placeholder ledger is clean.</div>`;
        return;
    }
    container.innerHTML = '';
    savedCollection.forEach(product => {
        const sym = (currentVerifiedProfile && currentVerifiedProfile.country === "Ghana") ? `₵${product.priceGHS}` : `₦${product.priceNGN.toLocaleString()}`;
        const card = document.createElement("div");
        card.className = "bg-surface rounded-xl overflow-hidden border border-rose-gold/10 shadow-sm flex flex-col hover:shadow-md transition-shadow product-card-container";
        card.innerHTML = `
            <button onclick="toggleSavedCollectionItem('${product._id}', event)" class="favorite-heart-btn active heart-toggle-${product._id}"><i class="fa-solid fa-heart text-red-500"></i></button>
            <div class="relative aspect-square overflow-hidden bg-zinc-100 cursor-pointer" onclick="renderIsolatedProductView('${product._id}')">
                <img src="${product.image}" alt="${product.title}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/300x400?text=Premium+Hair'">
            </div>
            <div class="p-3 flex-1 flex flex-col justify-between space-y-2">
                <div><h3 class="font-serif text-xs font-bold text-primary line-clamp-1">${product.title}</h3><p class="font-sans text-xs font-bold text-accent">${sym}</p></div>
                <button onclick="addItemToShoppingBag('${product._id}')" class="w-full bg-accent text-white font-sans font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider">Add to Bag</button>
            </div>`;
        container.appendChild(card);
    });
}



function renderStarDisplay(rating, count) {
    const r = parseFloat(rating) || 0;
    const full = Math.floor(r), half = r % 1 >= 0.5, empty = 5 - full - (half ? 1 : 0);
    let stars = '';
    for (let i = 0; i < full; i++) stars += '<i class="fa-solid fa-star" style="color:#f59e0b;font-size:11px;"></i>';
    if (half) stars += '<i class="fa-solid fa-star-half-stroke" style="color:#f59e0b;font-size:11px;"></i>';
    for (let i = 0; i < empty; i++) stars += '<i class="fa-regular fa-star" style="color:#d1cdc9;font-size:11px;"></i>';
    const label = count ? `${r.toFixed(1)} (${count} review${count !== 1 ? 's' : ''})` : 'No reviews yet';
    return `<div style="display:flex;align-items:center;gap:4px;">${stars}<span style="font-size:10px;color:#78716C;font-weight:700;">${label}</span></div>`;
}

function selectStar(rating, productId) {
    selectedRatings[productId] = rating;
    document.querySelectorAll(`.star-btn-${productId}`).forEach((btn, i) => {
        btn.innerHTML = i < rating ? '<i class="fa-solid fa-star" style="color:#f59e0b;"></i>' : '<i class="fa-regular fa-star" style="color:#d1cdc9;"></i>';
    });
}


function buildStockBadge(product) {
    if (!product.instock || product.allocatedStock <= 0)
        return `<span class="absolute top-2 left-2 bg-red-600 text-white font-sans text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Out of Stock</span>`;
    if (product.allocatedStock <= 5)
        return `<span class="absolute top-2 left-2 bg-orange-500 text-white font-sans text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">${product.allocatedStock} Left</span>`;
    return '';
}

function buildProductCard(product) {
    const isWishlisted = savedCollection.some(i => i._id === product._id);
    const isAvailable = product.instock && product.allocatedStock > 0;
    const sym = (currentVerifiedProfile && currentVerifiedProfile.country === "Ghana")
        ? `<p class="font-sans text-xs font-bold text-accent">₵${product.priceGHS}</p>`
        : `<p class="font-sans text-xs font-bold text-accent">₦${product.priceNGN.toLocaleString()}</p><p class="font-sans text-[10px] text-muted font-bold">₵${product.priceGHS}</p>`;
    const card = document.createElement("div");
    card.className = "bg-surface rounded-xl overflow-hidden border border-rose-gold/10 shadow-sm flex flex-col hover:shadow-md transition-shadow product-card-container";
    card.innerHTML = `
        <button onclick="toggleSavedCollectionItem('${product._id}', event)" class="favorite-heart-btn ${isWishlisted ? 'active' : ''} heart-toggle-${product._id}">
            <i class="${isWishlisted ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'}"></i>
        </button>
        <div class="relative aspect-square overflow-hidden bg-zinc-100 cursor-pointer" onclick="renderIsolatedProductView('${product._id}')">
            <img src="${product.image}" alt="${product.title}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" onerror="this.src='https://placehold.co/300x400?text=Premium+Hair'">
            ${buildStockBadge(product)}
        </div>
        <div class="p-3 flex-1 flex flex-col justify-between space-y-2">
            <div class="space-y-0.5">
                <h3 class="font-serif text-xs font-bold text-primary line-clamp-1 cursor-pointer hover:text-accent" onclick="renderIsolatedProductView('${product._id}')">${product.title}</h3>
                <div class="flex justify-between items-center">${sym}</div>
                <div class="mt-0.5">${renderStarDisplay(product.avgRating, product.reviewCount)}</div>
            </div>
            <button onclick="addItemToShoppingBag('${product._id}')" ${!isAvailable ? 'disabled' : ''} class="w-full bg-accent/10 border border-accent/20 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-accent/10 disabled:hover:text-accent text-accent font-sans font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors">
                ${isAvailable ? 'Add to Bag' : 'Sold Out'}
            </button>
        </div>`;
    return card;
}

async function loadStorefrontProducts() {
    try {
        const data = await fetch('http://localhost:5000/api/products').then(r => r.json());
        const grid = document.getElementById("productGrid");
        if (!grid) return;
        grid.innerHTML = "";
        if (!data.success || data.products.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-20 text-xs opacity-50 font-medium">No matching hair variants found inside data registries.</div>`;
            return;
        }
        databaseInventoryCache = data.products;
        data.products.forEach(p => grid.appendChild(buildProductCard(p)));
    } catch (err) { console.error("Storefront load error:", err); }
}

function handleSearch(query) {
    const q = query.toLowerCase().trim();
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const matches = databaseInventoryCache.filter(p => p.title.toLowerCase().includes(q));
    if (!matches.length) { grid.innerHTML = `<div class="col-span-full text-center py-20 text-xs opacity-50 font-medium">No units match criteria filters.</div>`; return; }
    matches.forEach(p => grid.appendChild(buildProductCard(p)));
}

function renderIsolatedProductView(productId) {
    const product = databaseInventoryCache.find(i => i._id === productId);
    if (!product) return;
    const isWishlisted = savedCollection.some(i => i._id === product._id);
    const isAvailable = product.instock && product.allocatedStock > 0;
    const displayPrice = (currentVerifiedProfile && currentVerifiedProfile.country === "Ghana")
        ? `₵${product.priceGHS}`
        : `₦${product.priceNGN.toLocaleString()}`;
    const stockInfo = product.allocatedStock <= 0
        ? `<span class="text-red-500">Out of Stock</span>`
        : product.allocatedStock <= 5 ? `<span class="text-orange-500">${product.allocatedStock} units left</span>` : 'In Stock (Ready to dispatch)';
    const reviewForm = currentVerifiedProfile ? `
        <div class="bg-canvas rounded-xl p-4 space-y-3 border border-rose-gold/10">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted">Leave Your Review</h4>
            <div class="flex gap-2" id="starSelector-${product._id}">
                ${[1,2,3,4,5].map(n => `<button type="button" onclick="selectStar(${n},'${product._id}')" class="star-btn-${product._id} text-2xl transition-transform hover:scale-110"><i class="fa-regular fa-star" style="color:#d1cdc9;"></i></button>`).join('')}
            </div>
            <textarea id="reviewComment-${product._id}" rows="3" placeholder="Share your experience with this hair unit..." class="w-full bg-surface border border-accent/20 rounded-xl p-3 text-xs focus:outline-none focus:border-accent resize-none"></textarea>
            <button onclick="submitProductReview('${product._id}')" class="w-full bg-accent text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-sm">Submit Review</button>
        </div>` : `
        <p class="text-xs text-muted text-center py-3 bg-canvas rounded-xl">
            <button onclick="switchView('account')" class="text-accent font-bold underline">Sign in</button> to leave a review.
        </p>`;

    document.getElementById("productDetailContent").innerHTML = `
        <div class="aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-rose-gold/10 relative">
            <button onclick="toggleSavedCollectionItem('${product._id}', event)" class="favorite-heart-btn ${isWishlisted ? 'active' : ''} heart-toggle-${product._id}">
                <i class="${isWishlisted ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'}"></i>
            </button>
            <img src="${product.image}" alt="${product.title}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/300x400?text=Hair'">
        </div>
        <div class="flex flex-col justify-between py-2 space-y-4">
            <div class="space-y-3">
                <span class="bg-accent/10 text-accent px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider">${product.origin || 'Vietnamese'} Custom Collection</span>
                <h2 class="font-serif text-lg md:text-xl font-bold text-accent">${product.title}</h2>
                <div class="font-sans text-base font-extrabold text-primary">${displayPrice}</div>
                <div id="avgRatingDisplay-${product._id}">${renderStarDisplay(product.avgRating, product.reviewCount)}</div>
                <p class="text-xs text-muted leading-relaxed">${product.description || 'Premium authentic selection.'}</p>
                <div class="text-[11px] font-semibold opacity-60">Availability: ${stockInfo}</div>
            </div>
            <button onclick="addItemToShoppingBag('${product._id}')" ${!isAvailable ? 'disabled' : ''} class="w-full bg-accent disabled:opacity-40 text-white font-sans font-bold py-3 rounded-xl text-xs uppercase tracking-widest shadow-md">
                ${isAvailable ? 'Secure Unit into Shopping Bag' : 'Sold Out Collection'}
            </button>
        </div>
        <div class="col-span-full border-t border-rose-gold/10 pt-6 space-y-5">
            <h3 class="font-serif text-sm font-bold text-accent">Customer Reviews</h3>
            ${reviewForm}
            <div id="reviewsList-${product._id}" class="space-y-3">
                <p class="text-xs text-muted text-center py-4 animate-pulse">Loading reviews...</p>
            </div>
        </div>`;

    switchView("product-detail");
    loadProductReviews(productId);
}



async function loadProductReviews(productId) {
    const container = document.getElementById(`reviewsList-${productId}`);
    if (!container) return;
    try {
        const data = await fetch(`http://localhost:5000/api/reviews/product/${productId}`).then(r => r.json());
        if (!data.success || data.reviews.length === 0) {
            container.innerHTML = `<p class="text-xs text-muted text-center py-4">No reviews yet. Be the first to leave one!</p>`;
            return;
        }
        container.innerHTML = '';
        data.reviews.forEach(review => {
            const date = new Date(review.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
            let stars = '';
            for (let i = 0; i < 5; i++) stars += `<i class="${i < review.rating ? 'fa-solid' : 'fa-regular'} fa-star" style="color:${i < review.rating ? '#f59e0b' : '#d1cdc9'};font-size:11px;"></i>`;

            const isOwner = currentVerifiedProfile && review.userContact === currentVerifiedProfile.contact;
            const moreMenu = isOwner ? `
                <div class="relative flex-shrink-0">
                    <button onclick="toggleReviewMenu('${review._id}')" class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-gold/20 transition-colors text-muted" aria-label="Review options">
                        <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                    </button>
                    <div id="reviewMenu-${review._id}" class="hidden absolute right-0 top-8 bg-surface border border-rose-gold/20 rounded-xl shadow-xl z-20 overflow-hidden" style="min-width:130px;">
                        <button onclick="startEditReview('${review._id}','${productId}')" class="w-full text-left px-3 py-2.5 text-[11px] font-bold text-primary hover:bg-canvas flex items-center gap-2 transition-colors">
                            <i class="fa-solid fa-pen text-accent text-[10px]"></i> Edit Comment
                        </button>
                        <button onclick="deleteReview('${review._id}','${productId}')" class="w-full text-left px-3 py-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors">
                            <i class="fa-solid fa-trash text-[10px]"></i> Delete
                        </button>
                    </div>
                </div>` : '';

            const card = document.createElement('div');
            card.className = "bg-canvas rounded-xl p-4 border border-rose-gold/10 space-y-2";
            card.id = `reviewCard-${review._id}`;
            card.innerHTML = `
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <p class="font-bold text-xs text-primary">${review.userName}</p>
                        <p class="text-[10px] text-muted">${date}</p>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <div class="flex gap-0.5">${stars}</div>
                        ${moreMenu}
                    </div>
                </div>
                <p id="reviewText-${review._id}" class="text-xs text-muted leading-relaxed">${review.comment}</p>`;
            container.appendChild(card);
        });
    } catch (err) {
        console.error("Review load error:", err);
        container.innerHTML = `<p class="text-xs text-muted text-center py-4">Could not load reviews.</p>`;
    }
}

function toggleReviewMenu(reviewId) {
    const menu = document.getElementById(`reviewMenu-${reviewId}`);
    if (!menu) return;
    const wasHidden = menu.classList.contains('hidden');
    document.querySelectorAll('[id^="reviewMenu-"]').forEach(m => m.classList.add('hidden'));
    if (wasHidden) {
        menu.classList.remove('hidden');
        setTimeout(() => {
            const outsideClose = (e) => {
                if (!menu.contains(e.target)) {
                    menu.classList.add('hidden');
                    document.removeEventListener('click', outsideClose);
                }
            };
            document.addEventListener('click', outsideClose);
        }, 10);
    }
}


function startEditReview(reviewId, productId) {
    document.getElementById(`reviewMenu-${reviewId}`)?.classList.add('hidden');
    const textEl = document.getElementById(`reviewText-${reviewId}`);
    if (!textEl) return;
    const original = textEl.innerText;

    textEl.outerHTML = `
        <div id="editForm-${reviewId}" data-original="${original.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">
            <textarea id="editInput-${reviewId}" rows="3" class="w-full bg-surface border border-accent/20 rounded-xl p-3 text-xs focus:outline-none focus:border-accent resize-none mt-1">${original}</textarea>
            <div class="flex gap-2 mt-2">
                <button onclick="saveReviewEdit('${reviewId}','${productId}')" class="flex-1 bg-accent text-white font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider shadow-sm">Save</button>
                <button onclick="cancelReviewEdit('${reviewId}')" class="flex-1 bg-canvas border border-rose-gold font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider">Cancel</button>
            </div>
        </div>`;
}


function cancelReviewEdit(reviewId) {
    const editForm = document.getElementById(`editForm-${reviewId}`);
    if (!editForm) return;
    const original = editForm.dataset.original || '';
    editForm.outerHTML = `<p id="reviewText-${reviewId}" class="text-xs text-muted leading-relaxed">${original}</p>`;
}

async function saveReviewEdit(reviewId, productId) {
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    const newComment = document.getElementById(`editInput-${reviewId}`)?.value.trim();
    if (!newComment) { triggerToastNotification("Comment cannot be empty."); return; }
    try {
        const data = await fetch(`http://localhost:5000/api/reviews/edit/${reviewId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ comment: newComment })
        }).then(r => r.json());
        if (data.success) {
            triggerToastNotification("Review updated!");
            const editForm = document.getElementById(`editForm-${reviewId}`);
            if (editForm) editForm.outerHTML = `<p id="reviewText-${reviewId}" class="text-xs text-muted leading-relaxed">${newComment}</p>`;
        } else triggerToastNotification(data.message || "Failed to update review.");
    } catch (err) { console.error("Edit error:", err); triggerToastNotification("Error updating review."); }
}

async function deleteReview(reviewId, productId) {
    if (!confirm("Delete this review? This cannot be undone.")) return;
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    try {
        const data = await fetch(`http://localhost:5000/api/reviews/delete/${reviewId}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        if (data.success) {
            triggerToastNotification("Review deleted.");
            document.getElementById(`reviewCard-${reviewId}`)?.remove();
            loadProductReviews(productId);
            loadStorefrontProducts();
            const updatedProducts = await fetch('http://localhost:5000/api/products').then(r => r.json());
            if (updatedProducts.success) {
                const p = updatedProducts.products.find(x => x._id === productId);
                if (p) {
                    const avgEl = document.getElementById(`avgRatingDisplay-${productId}`);
                    if (avgEl) avgEl.innerHTML = renderStarDisplay(p.avgRating, p.reviewCount);
                    const cached = databaseInventoryCache.find(x => x._id === productId);
                    if (cached) { cached.avgRating = p.avgRating; cached.reviewCount = p.reviewCount; }
                }
            }
        } else triggerToastNotification(data.message || "Failed to delete review.");
    } catch (err) { console.error("Delete error:", err); triggerToastNotification("Error deleting review."); }
}

async function submitProductReview(productId) {
    const token = localStorage.getItem('esthyceeToken');
    if (!token || !currentVerifiedProfile) { triggerToastNotification("Please sign in to leave a review."); return; }
    const rating = selectedRatings[productId];
    const comment = document.getElementById(`reviewComment-${productId}`)?.value.trim();
    if (!rating) { triggerToastNotification("Please select a star rating."); return; }
    if (!comment) { triggerToastNotification("Please write a comment before submitting."); return; }
    try {
        const data = await fetch('http://localhost:5000/api/reviews/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ productId, rating, comment })
        }).then(r => r.json());
        if (data.success) {
            triggerToastNotification("Review submitted! Thank you 🖤");
            delete selectedRatings[productId];
            const commentEl = document.getElementById(`reviewComment-${productId}`);
            if (commentEl) commentEl.value = '';
            document.querySelectorAll(`.star-btn-${productId}`).forEach(btn => {
                btn.innerHTML = '<i class="fa-regular fa-star" style="color:#d1cdc9;"></i>';
            });
            loadProductReviews(productId);
            loadStorefrontProducts();
            const updated = await fetch('http://localhost:5000/api/products').then(r => r.json());
            if (updated.success) {
                const p = updated.products.find(x => x._id === productId);
                if (p) {
                    const avgEl = document.getElementById(`avgRatingDisplay-${productId}`);
                    if (avgEl) avgEl.innerHTML = renderStarDisplay(p.avgRating, p.reviewCount);
                    const cached = databaseInventoryCache.find(x => x._id === productId);
                    if (cached) { cached.avgRating = p.avgRating; cached.reviewCount = p.reviewCount; }
                }
            }
        } else triggerToastNotification(data.message || "Could not save review.");
    } catch (err) { console.error("Review submit error:", err); triggerToastNotification("Error submitting review."); }
}



function addItemToShoppingBag(productId) {
    if (!currentVerifiedProfile) { triggerToastNotification("Please login to shop."); switchView("account"); return; }
    const product = databaseInventoryCache.find(i => i._id === productId);
    if (!product) return;
    if (!product.instock || product.allocatedStock <= 0) { triggerToastNotification("This item is out of stock."); return; }
    const price = (currentVerifiedProfile.country === "Ghana") ? product.priceGHS : product.priceNGN;
    const existing = shoppingBag.find(i => i._id === productId);
    if (existing) existing.quantity++; else shoppingBag.push({ _id: product._id, title: product.title, price, image: product.image, quantity: 1 });
    product.allocatedStock = Math.max(0, (product.allocatedStock || 1) - 1);
    if (product.allocatedStock === 0) product.instock = false;
    refreshShoppingBagUI(); loadStorefrontProducts();
    triggerToastNotification(`Added "${product.title}" to bag.`);
    decreaseProductStockOnServer(productId);
}

async function decreaseProductStockOnServer(productId) {
    try { await fetch(`http://localhost:5000/api/products/${productId}/stock/decrease`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' } }); }
    catch (err) { console.error('Stock sync error:', err); }
}

function modifyBagQuantity(productId, change) {
    const item = shoppingBag.find(i => i._id === productId);
    if (!item) return;
    if (change > 0) {
        const product = databaseInventoryCache.find(p => p._id === productId);
        if (product && product.allocatedStock <= 0) { triggerToastNotification("No more stock available."); return; }
        if (product) { product.allocatedStock = Math.max(0, (product.allocatedStock || 0) - 1); decreaseProductStockOnServer(productId); }
    }
    item.quantity += change;
    if (item.quantity <= 0) shoppingBag = shoppingBag.filter(i => i._id !== productId);
    refreshShoppingBagUI();
}

function refreshShoppingBagUI() {
    const list = document.getElementById("cartItemsList");
    const badge = document.getElementById("cartCount");
    const total = document.getElementById("cartTotal");
    if (!list) return;
    list.innerHTML = "";
    let qty = 0, sum = 0;
    const sym = (currentVerifiedProfile && currentVerifiedProfile.country === "Ghana") ? "₵" : "₦";
    if (shoppingBag.length === 0) {
        list.innerHTML = `<div class="text-center py-20 text-xs opacity-40 font-medium">Your shopping bag is completely empty.</div>`;
        if (badge) badge.classList.add("hidden");
        if (total) total.innerText = `${sym}0.00`;
        backupCartToServer(); return;
    }
    shoppingBag.forEach(item => {
        qty += item.quantity; sum += item.price * item.quantity;
        const el = document.createElement("div");
        el.className = "flex gap-3 bg-canvas p-2.5 rounded-xl border border-rose-gold/10 items-center";
        el.innerHTML = `
            <div class="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 flex-shrink-0">
                <img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/100x100?text=Wig'">
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-serif text-xs font-bold text-primary truncate">${item.title}</h4>
                <p class="font-sans text-[11px] font-bold text-accent mt-0.5">${sym}${item.price.toLocaleString()}</p>
            </div>
            <div class="flex items-center gap-2 bg-surface rounded-lg p-1 border border-rose-gold/10">
                <button onclick="modifyBagQuantity('${item._id}',-1)" class="w-5 h-5 flex items-center justify-center text-[10px] font-bold"><i class="fa-solid fa-minus"></i></button>
                <span class="font-sans text-xs font-bold px-0.5">${item.quantity}</span>
                <button onclick="modifyBagQuantity('${item._id}',1)" class="w-5 h-5 flex items-center justify-center text-[10px] font-bold"><i class="fa-solid fa-plus"></i></button>
            </div>`;
        list.appendChild(el);
    });
    if (badge) { badge.innerText = qty; badge.classList.remove("hidden"); }
    if (total) total.innerText = `${sym}${sum.toLocaleString()}`;
    backupCartToServer();
}

function backupCartToServer() {
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    fetch('http://localhost:5000/api/cart/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ shoppingBag })
    }).catch(() => {});
}


function proceedToCheckout() {
    if (shoppingBag.length === 0) { triggerToastNotification("Your shopping bag is empty."); return; }
    if (!currentVerifiedProfile) {
        triggerToastNotification("Please login before checking out.");
        document.getElementById("cartDrawer").classList.add("translate-x-full");
        switchView("account"); return;
    }
    const total = shoppingBag.reduce((a, i) => a + i.price * i.quantity, 0);
    triggerToastNotification("Initializing secured Paystack gateway node...");
    PaystackPop.setup({
        key: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        email: currentVerifiedProfile.contact.includes("@") ? currentVerifiedProfile.contact : "boutique@esthycee.com",
        amount: total * 100,
        currency: currentVerifiedProfile.country === "Ghana" ? "GHS" : "NGN",
        ref: 'EC-' + Math.floor(Math.random() * 1000000000 + 1),
        metadata: { custom_fields: [
            { display_name: "Customer", variable_name: "customer", value: currentVerifiedProfile.name },
            { display_name: "Address", variable_name: "address", value: currentVerifiedProfile.address }
        ]},
        callback: function(res) {
            const orderData = {
                customerName: currentVerifiedProfile.name, customerEmail: currentVerifiedProfile.contact,
                customerPhone: currentVerifiedProfile.phone, deliveryAddress: currentVerifiedProfile.address,
                country: currentVerifiedProfile.country,
                currencySymbol: currentVerifiedProfile.country === 'Ghana' ? '₵' : '₦',
                currency: currentVerifiedProfile.country === 'Ghana' ? 'GHS' : 'NGN',
                items: shoppingBag.map(i => ({ ...i })), total, reference: res.reference,
                date: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })
            };
            shoppingBag = []; refreshShoppingBagUI();
            document.getElementById("cartDrawer").classList.add("translate-x-full");
            showReceiptModal(orderData); saveOrderToServer(orderData);
            triggerToastNotification("Order processed! Your receipt is ready.");
        },
        onClose: function() { triggerToastNotification("Payment window closed."); }
    }).openIframe();
}

function showReceiptModal(order) {
    lastReceiptData = order;
    const rows = order.items.map(i => `
        <tr>
            <td style="padding:8px 0;border-bottom:1px solid #FAF6F0;font-size:12px;color:#1C1917;">${i.title}</td>
            <td style="padding:8px 0;border-bottom:1px solid #FAF6F0;text-align:center;font-size:12px;color:#78716C;">${i.quantity}</td>
            <td style="padding:8px 0;border-bottom:1px solid #FAF6F0;text-align:right;font-size:12px;font-weight:700;color:#5C134F;">${order.currencySymbol}${(i.price*i.quantity).toLocaleString()}</td>
        </tr>`).join('');
    document.getElementById('receiptContent').innerHTML = `
        <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #E7C2B3;margin-bottom:20px;">
            <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:#5C134F;">EsthyCee Hair World</div>
            <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#78716C;margin-top:3px;">Premium Boutique — Official Receipt</div>
        </div>
        <div style="font-size:11px;color:#78716C;margin-bottom:20px;line-height:2;">
            <div><strong style="color:#1C1917;">Customer:</strong> ${order.customerName}</div>
            <div><strong style="color:#1C1917;">Email:</strong> ${order.customerEmail}</div>
            <div><strong style="color:#1C1917;">Phone:</strong> ${order.customerPhone}</div>
            <div><strong style="color:#1C1917;">Delivery Address:</strong> ${order.deliveryAddress}</div>
            <div><strong style="color:#1C1917;">Market:</strong> ${order.country}</div>
            <div><strong style="color:#1C1917;">Date:</strong> ${order.date}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead><tr>
                <th style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78716C;padding:6px 0;border-bottom:2px solid #E7C2B3;text-align:left;">Item</th>
                <th style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78716C;padding:6px 0;border-bottom:2px solid #E7C2B3;text-align:center;">Qty</th>
                <th style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78716C;padding:6px 0;border-bottom:2px solid #E7C2B3;text-align:right;">Amount</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;color:#5C134F;border-top:2px solid #5C134F;padding-top:12px;margin-bottom:16px;">
            <span>Total Paid</span><span>${order.currencySymbol}${order.total.toLocaleString()}</span>
        </div>
        <div style="text-align:center;font-size:10px;color:#78716C;padding-top:12px;border-top:1px dashed #E7C2B3;">
            <div style="font-weight:700;color:#1C1917;margin-bottom:4px;">Paystack Ref: ${order.reference}</div>
            <div>Thank you for shopping with EsthyCee Hair World 🖤</div>
            <div style="margin-top:4px;">Opposite Unizik junction, Awka, Anambra · +2348090887714</div>
        </div>`;
    const modal = document.getElementById('receiptModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeReceiptModal() {
    const modal = document.getElementById('receiptModal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

function printReceipt() {
    if (!lastReceiptData) return;
    const order = lastReceiptData;
    const rows = order.items.map(i => `<tr><td>${i.title}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${order.currencySymbol}${(i.price*i.quantity).toLocaleString()}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EsthyCee Receipt — ${order.reference}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Plus Jakarta Sans',sans-serif;background:#FAF6F0;display:flex;justify-content:center;padding:40px 20px}.receipt{background:#fff;max-width:460px;width:100%;border-radius:16px;padding:36px;box-shadow:0 4px 32px rgba(92,19,79,.12)}.brand{font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:#5C134F;text-align:center}.sub{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#78716C;text-align:center;margin-top:3px}.badge{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#5C134F;background:#FAF6F0;padding:4px 14px;border-radius:20px;margin:12px auto 0;display:block;text-align:center}.hr{border:none;border-top:2px solid #E7C2B3;margin:20px 0}.hrd{border:none;border-top:1px dashed #E7C2B3;margin:16px 0}.meta{font-size:11px;color:#78716C;line-height:2}.meta strong{color:#1C1917}table{width:100%;border-collapse:collapse;margin:16px 0}th{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78716C;padding:8px 0;border-bottom:2px solid #E7C2B3;text-align:left;font-weight:700}th:last-child,td:last-child{text-align:right}th:nth-child(2),td:nth-child(2){text-align:center}td{font-size:12px;color:#1C1917;padding:9px 0;border-bottom:1px solid #FAF6F0}td:last-child{font-weight:700;color:#5C134F}.total{display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#5C134F;padding-top:14px;border-top:2px solid #5C134F;margin-top:4px}.ref{text-align:center;font-size:10px;color:#78716C;margin-top:4px}.ref strong{color:#1C1917}.footer{text-align:center;font-size:10px;color:#78716C;margin-top:20px;line-height:1.8}@media print{body{background:#fff;padding:0}.receipt{box-shadow:none;border-radius:0}}</style>
</head><body><div class="receipt">
<div class="brand">EsthyCee Hair World</div><div class="sub">Premium Boutique</div><div class="badge">Payment Receipt</div>
<hr class="hr">
<div class="meta"><div><strong>Customer:</strong> ${order.customerName}</div><div><strong>Email:</strong> ${order.customerEmail}</div><div><strong>Phone:</strong> ${order.customerPhone}</div><div><strong>Delivery Address:</strong> ${order.deliveryAddress}</div><div><strong>Market:</strong> ${order.country}</div><div><strong>Date:</strong> ${order.date}</div></div>
<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><span>Total Paid</span><span>${order.currencySymbol}${order.total.toLocaleString()}</span></div>
<hr class="hrd"><div class="ref"><strong>Paystack Reference: ${order.reference}</strong></div>
<div class="footer">Thank you for shopping with EsthyCee Hair World 🖤<br>Opposite Unizik junction, Awka, Anambra State<br>+2348090887714 · akpulonuchidinma@gmail.com</div>
</div></body></html>`;
    const win = window.open('', '_blank', 'width=600,height=750');
    win.document.write(html); win.document.close();
    win.onload = () => { win.focus(); win.print(); };
}

async function saveOrderToServer(orderData) {
    const token = localStorage.getItem('esthyceeToken');
    if (!token) return;
    try {
        await fetch('http://localhost:5000/api/orders/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                items: orderData.items, total: orderData.total,
                currency: orderData.currency, currencySymbol: orderData.currencySymbol,
                paystackRef: orderData.reference, customerName: orderData.customerName,
                customerPhone: orderData.customerPhone, deliveryAddress: orderData.deliveryAddress,
                country: orderData.country
            })
        });
    } catch (err) { console.error('Order save error:', err); }
}



async function loadOrderLedger() {
    const token = localStorage.getItem('esthyceeToken');
    const inbox = document.getElementById("inboxList");
    if (!inbox) return;
    if (!token || !currentVerifiedProfile) {
        inbox.innerHTML = `<p class="text-xs opacity-50 text-center py-10">Please sign in to view your order history.</p>`; return;
    }
    inbox.innerHTML = `<p class="text-xs opacity-50 text-center py-10 animate-pulse">Loading your order history...</p>`;
    try {
        const data = await fetch('http://localhost:5000/api/orders/my-orders', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
        if (!data.success || data.orders.length === 0) {
            inbox.innerHTML = `<p class="text-xs opacity-50 text-center py-10">No orders placed yet.</p>`; return;
        }
        inbox.innerHTML = '';
        data.orders.forEach(order => {
            const sym = order.currencySymbol || (order.currency === 'GHS' ? '₵' : '₦');
            const date = new Date(order.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
            const items = order.items.map(i => `<div class="flex justify-between text-[10px] py-0.5"><span class="text-muted truncate">${i.title} ×${i.quantity}</span><span class="font-bold text-accent flex-shrink-0 ml-2">${sym}${(i.price*i.quantity).toLocaleString()}</span></div>`).join('');
            const card = document.createElement('div');
            card.className = "bg-surface rounded-xl border border-rose-gold/20 p-4 space-y-3 shadow-sm";
            card.innerHTML = `
                <div class="flex items-start justify-between gap-2">
                    <div><p class="font-serif text-xs font-bold text-accent">Order Receipt</p><p class="text-[10px] text-muted mt-0.5">${date}</p></div>
                    <span class="bg-green-500/10 text-green-700 text-[9px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider flex-shrink-0">Paid</span>
                </div>
                <div class="border-t border-rose-gold/10 pt-2 space-y-0.5">${items}</div>
                <div class="flex justify-between items-center border-t border-rose-gold/10 pt-2">
                    <span class="text-[10px] font-bold text-muted uppercase tracking-wide">Total Paid</span>
                    <span class="font-bold text-sm text-accent">${sym}${order.total.toLocaleString()}</span>
                </div>
                <div class="text-[9px] text-muted font-mono">Ref: ${order.paystackRef}</div>`;
            inbox.appendChild(card);
        });
    } catch (err) {
        console.error("Ledger load error:", err);
        inbox.innerHTML = `<p class="text-xs opacity-50 text-center py-10">Could not load order history.</p>`;
    }
}


function handleAdminImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        triggerToastNotification("Please select a valid image file.");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const MAX_WIDTH = 900;
            let { width, height } = img;
            if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            adminSelectedImageBase64 = canvas.toDataURL('image/jpeg', 0.75);

            const previewWrap = document.getElementById('adminImagePreviewWrap');
            const previewImg = document.getElementById('adminImagePreview');
            if (previewImg) previewImg.src = adminSelectedImageBase64;
            if (previewWrap) previewWrap.classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function adjustAdminPrice(amount) {
    const input = document.getElementById('adminPriceInput');
    if (input) input.value = Math.max(0, (parseInt(input.value) || 0) + amount);
}
function syncAdminPrice() {
    const input = document.getElementById('adminPriceInput');
    if (input && (parseInt(input.value) < 0 || isNaN(parseInt(input.value)))) input.value = 0;
}
function adjustAdminStock(amount) {
    const input = document.getElementById('adminStockInput');
    if (!input) return;
    input.value = Math.max(1, (parseInt(input.value) || 1) + amount);
    currentStockCounterValue = parseInt(input.value);
}
function syncAdminStock() {
    const input = document.getElementById('adminStockInput');
    if (input && (parseInt(input.value) < 1 || isNaN(parseInt(input.value)))) input.value = 1;
    currentStockCounterValue = parseInt(input.value);
}

async function handleAdminProductSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('adminTitle').value.trim();
    const image = adminSelectedImageBase64;
    const priceNGN = parseInt(document.getElementById('adminPriceInput').value) || 0;
    const priceGHS = Math.round(priceNGN / 10);
    const description = document.getElementById('adminDescription').value.trim();
    const allocatedStock = parseInt(document.getElementById('adminStockInput').value) || currentStockCounterValue;
    if (!title || !image || priceNGN <= 0) { triggerToastNotification("Please fill in the name, upload a photo, and set a price."); return; }
    try {
        const data = await fetch('http://localhost:5000/api/admin/products/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, image, priceNGN, priceGHS, description, instock: true, allocatedStock })
        }).then(r => r.json());
        if (data.success) {
            triggerToastNotification('Product published to live storefront!');
            document.getElementById('adminProductForm').reset();
            document.getElementById('adminPriceInput').value = '150000';
            document.getElementById('adminStockInput').value = '5';
            document.getElementById('adminImagePreviewWrap').classList.add('hidden');
            adminSelectedImageBase64 = null;
            currentStockCounterValue = 5;
            renderAdminInventoryControl(); loadStorefrontProducts();
        } else triggerToastNotification('Failed to publish product.');
    } catch (err) { triggerToastNotification('Server error. Check your connection.'); }
}

async function renderAdminInventoryControl() {
    try {
        const data = await fetch('http://localhost:5000/api/products').then(r => r.json());
        const grid = document.getElementById('adminInventoryGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!data.success || data.products.length === 0) {
            grid.innerHTML = `<p class="text-xs text-stone-400 italic">No products currently listed.</p>`; return;
        }
        data.products.forEach(item => {
            const stock = item.allocatedStock || 0;
            const stockColor = stock === 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600';
            const stockLabel = stock === 0 ? 'OUT OF STOCK' : `${stock} left`;
            const row = document.createElement('div');
            row.className = "bg-stone-50 dark:bg-stone-900/40 p-3 rounded-xl border border-stone-200/60 dark:border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-3";
            row.innerHTML = `
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <img src="${item.image}" class="w-10 h-10 rounded-lg object-cover bg-stone-200 flex-shrink-0" onerror="this.src='https://placehold.co/100x100?text=Hair'">
                    <div class="min-w-0 flex-1 space-y-1">
                        <input type="text" id="editTitle-${item._id}" value="${item.title}" class="font-sans font-bold text-xs bg-transparent border-b border-transparent focus:border-accent focus:outline-none text-stone-800 dark:text-stone-200 truncate block w-full">
                        <div class="flex gap-2 items-center flex-wrap">
                            <span class="text-[10px] font-bold text-accent">₦</span>
                            <input type="number" id="editPrice-${item._id}" value="${item.priceNGN}" class="w-20 text-[10px] font-medium bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded px-1 focus:outline-none">
                            <div class="flex items-center gap-1">
                                <span class="text-[10px] text-muted font-bold">Stock:</span>
                                <button type="button" onclick="adjustInventoryStock('${item._id}',-1)" class="w-5 h-5 flex items-center justify-center bg-white border border-stone-200 rounded text-[9px] font-bold hover:bg-red-50 hover:text-red-600 transition-colors">-</button>
                                <input type="number" id="editStock-${item._id}" value="${stock}" min="0" class="w-12 text-center text-[10px] font-bold bg-white dark:bg-stone-950 border border-stone-200 rounded px-1 focus:outline-none">
                                <button type="button" onclick="adjustInventoryStock('${item._id}',1)" class="w-5 h-5 flex items-center justify-center bg-white border border-stone-200 rounded text-[9px] font-bold hover:bg-green-50 hover:text-green-600 transition-colors">+</button>
                                <span id="stockLabel-${item._id}" class="text-[9px] font-bold ml-1 ${stockColor}">${stockLabel}</span>
                            </div>
                        </div>
                        <div>${renderStarDisplay(item.avgRating, item.reviewCount)}</div>
                    </div>
                </div>
                <div class="flex gap-2 justify-end">
                    <button onclick="saveProductModifications('${item._id}')" class="bg-accent text-white px-3 py-1.5 rounded-lg text-[10px] font-sans font-bold flex items-center gap-1"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                    <button onclick="removeProductFromCatalog('${item._id}')" class="bg-red-50 hover:bg-red-500 hover:text-white text-red-600 px-3 py-1.5 rounded-lg text-[10px] font-sans font-bold transition-all flex items-center gap-1"><i class="fa-solid fa-trash-can"></i> Purge</button>
                </div>`;
            grid.appendChild(row);
        });
    } catch (err) { console.error("Admin inventory error:", err); }
}

function adjustInventoryStock(productId, change) {
    const input = document.getElementById(`editStock-${productId}`);
    const label = document.getElementById(`stockLabel-${productId}`);
    if (!input) return;
    const val = Math.max(0, (parseInt(input.value) || 0) + change);
    input.value = val;
    if (label) {
        label.innerText = val === 0 ? 'OUT OF STOCK' : `${val} left`;
        label.className = `text-[9px] font-bold ml-1 ${val === 0 ? 'text-red-500' : val <= 5 ? 'text-orange-500' : 'text-green-600'}`;
    }
}

async function saveProductModifications(productId) {
    const title = document.getElementById(`editTitle-${productId}`).value.trim();
    const priceNGN = parseInt(document.getElementById(`editPrice-${productId}`).value);
    const priceGHS = Math.round(priceNGN / 10);
    const allocatedStock = parseInt(document.getElementById(`editStock-${productId}`).value) || 0;
    try {
        const data = await fetch(`http://localhost:5000/api/admin/products/update/${productId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, priceNGN, priceGHS, allocatedStock })
        }).then(r => r.json());
        if (data.success) { triggerToastNotification("✨ Item synced perfectly!"); renderAdminInventoryControl(); loadStorefrontProducts(); }
    } catch (err) { console.error("Save error:", err); }
}

async function removeProductFromCatalog(productId) {
    if (!confirm("Delete this product permanently from the storefront?")) return;
    try {
        const data = await fetch(`http://localhost:5000/api/admin/products/delete/${productId}`, { method: 'DELETE' }).then(r => r.json());
        if (data.success) { renderAdminInventoryControl(); loadStorefrontProducts(); triggerToastNotification("Product removed."); }
    } catch (err) { console.error("Delete error:", err); }
}


function triggerToastNotification(msg) {
    const toast = document.getElementById("toastNotification");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.remove("translate-y-20", "opacity-0");
    clearTimeout(window.toastTimerDriver);
    window.toastTimerDriver = setTimeout(() => toast.classList.add("translate-y-20", "opacity-0"), 3000);
}
