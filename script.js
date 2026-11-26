(async () => {
  const KEYS = { inventory: "emto_inventory_v1", cart: "emto_cart_v1" };
  const categories = {
    shoes: { label: "Shoes", page: "Shoes.html", image: "images/shoes.jpg" },
    innerwear: { label: "Panties & Boxers", page: "innerwear.html", image: "images/Innerwear.jpg" },
    duvets: { label: "Duvets", page: "duvets.html", image: "images/duvets.jpg" },
  };
  const waNumber = "254704787531";
  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const money = (amount) => new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
  let inventory = read(KEYS.inventory, []);
  let serverMode = false;
  const adminForm = document.querySelector("[data-inventory-form]");
  let cart = read(KEYS.cart, {});
  if (!Array.isArray(inventory)) inventory = [];
  if (!cart || typeof cart !== "object" || Array.isArray(cart)) cart = {};

  async function initializeInventory() {
    try {
      if (adminForm) {
        const session = await fetch("/api/admin/session", { cache: "no-store" });
        if (!session.ok) {
          location.replace(session.status === 401 ? "/login.html" : "/login.html?server=missing");
          return false;
        }
      }
      const response = await fetch(adminForm ? "/api/admin/products" : "/api/products", { cache: "no-store" });
      if (!response.ok) throw new Error("Inventory service unavailable.");
      inventory = await response.json();
      if (!Array.isArray(inventory)) throw new Error("Invalid inventory response.");
      serverMode = true;
      reconcileCart();
      document.body.removeAttribute("data-auth-check");
      return true;
    } catch {
      if (adminForm) {
        location.replace("/login.html?server=missing");
        return false;
      }
      // Static previews can still show products saved by the older local-only version.
      serverMode = false;
      return true;
    }
  }

  async function persistInventory(products) {
    if (!serverMode) throw new Error("Start the shop server before editing inventory.");
    const response = await fetch("/api/admin/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products }),
    });
    if (response.status === 401) {
      location.replace("/login.html");
      throw new Error("Your sign-in expired. Please sign in again.");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save inventory.");
    inventory = result.products;
    reconcileCart();
  }

  // Homepage photo carousel.
  const carousel = document.querySelector("[data-carousel]");
  if (carousel) {
    const slides = [...carousel.querySelectorAll(".hero-slide")];
    const dots = [...carousel.querySelectorAll("[data-carousel-dot]")];
    let activeIndex = 0;
    let timer;
    const showSlide = (index) => {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === activeIndex;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      dots.forEach((dot, i) => {
        const active = i === activeIndex;
        dot.classList.toggle("is-active", active);
        if (active) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    };
    const stop = () => clearInterval(timer);
    const start = () => {
      stop();
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        timer = setInterval(() => showSlide(activeIndex + 1), 5500);
      }
    };
    carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => { showSlide(activeIndex - 1); start(); });
    carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => { showSlide(activeIndex + 1); start(); });
    dots.forEach((dot) => dot.addEventListener("click", () => { showSlide(Number(dot.dataset.carouselDot)); start(); }));
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", (event) => { if (!carousel.contains(event.relatedTarget)) start(); });
    showSlide(0);
    start();
  }

  const productCard = (product) => {
    const article = document.createElement("article");
    article.className = "product-card-shop";
    article.dataset.productSearch = `${product.name} ${product.description || ""} ${categories[product.category]?.label || ""}`.toLocaleLowerCase();
    const img = document.createElement("img");
    img.src = product.image || categories[product.category]?.image || "";
    img.alt = product.name;
    img.loading = "lazy";
    const content = document.createElement("div");
    content.className = "product-card-shop-content";
    const tag = document.createElement("span");
    tag.className = product.stock > 0 ? "stock-tag" : "stock-tag stock-tag-out";
    tag.textContent = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";
    const title = document.createElement("h3");
    title.textContent = product.name;
    const category = document.createElement("p");
    category.className = "product-category-label";
    category.textContent = categories[product.category]?.label || "Collection";
    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description || "Ask us for more details.";
    const price = document.createElement("p");
    price.className = "product-price";
    price.textContent = money(product.price);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "shop-button add-to-cart";
    add.dataset.addToCart = product.id;
    add.textContent = product.stock > 0 ? "Add to bag" : "Currently unavailable";
    add.disabled = product.stock < 1;
    content.append(tag, title, category, description, price, add);
    article.append(img, content);
    return article;
  };

  const renderCatalogs = () => {
    document.querySelectorAll("[data-product-catalog]").forEach((catalog) => {
      const targetCategory = catalog.dataset.category || "all";
      const list = catalog.querySelector("[data-product-list]");
      const empty = catalog.querySelector("[data-product-empty]");
      if (!list) return;
      list.replaceChildren();
      const products = inventory.filter((product) => targetCategory === "all" || product.category === targetCategory);
      products.forEach((product) => list.append(productCard(product)));
      if (empty) {
        empty.hidden = products.length > 0;
        empty.textContent = inventory.length
          ? "No products have been added to this collection yet. Please check back or contact us on WhatsApp."
          : "Our product catalogue is being updated. Please contact us on WhatsApp for current items.";
      }
    });
  };

  const setCart = (next) => {
    cart = next;
    save(KEYS.cart, cart);
    renderCart();
  };
  const reconcileCart = () => {
    const next = {};
    Object.entries(cart).forEach(([id, quantity]) => {
      const product = inventory.find((item) => item.id === id);
      const count = Math.min(Number(quantity) || 0, Number(product?.stock) || 0);
      if (product && count > 0) next[id] = count;
    });
    cart = next;
    save(KEYS.cart, cart);
  };
  const cartItems = () => Object.entries(cart)
    .map(([id, quantity]) => ({ product: inventory.find((item) => item.id === id), quantity: Number(quantity) }))
    .filter((item) => item.product && item.quantity > 0);
  const renderCart = () => {
    const count = cartItems().reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.querySelector("[data-cart-count]");
    if (badge) badge.textContent = String(count);
    const list = document.querySelector("[data-cart-items]");
    const totalNode = document.querySelector("[data-cart-total]");
    const empty = document.querySelector("[data-cart-empty]");
    const checkout = document.querySelector("[data-cart-checkout]");
    if (!list) return;
    const items = cartItems();
    list.replaceChildren();
    items.forEach(({ product, quantity }) => {
      const row = document.createElement("div");
      row.className = "cart-row";
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = product.name;
      const price = document.createElement("span");
      price.textContent = `${money(product.price)} each`;
      info.append(name, price);
      const controls = document.createElement("div");
      controls.className = "cart-row-controls";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Remove one ${product.name}`);
      minus.dataset.cartChange = product.id;
      minus.dataset.change = "-1";
      const qty = document.createElement("span");
      qty.textContent = String(quantity);
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Add one ${product.name}`);
      plus.dataset.cartChange = product.id;
      plus.dataset.change = "1";
      controls.append(minus, qty, plus);
      const subtotal = document.createElement("b");
      subtotal.textContent = money(product.price * quantity);
      row.append(info, controls, subtotal);
      list.append(row);
    });
    if (totalNode) totalNode.textContent = money(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0));
    if (empty) empty.hidden = items.length > 0;
    if (checkout) checkout.disabled = items.length === 0;
  };

  if (!adminForm && !document.querySelector("[data-cart-dialog]")) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cart-fab";
    trigger.dataset.cartOpen = "";
    trigger.innerHTML = 'Your bag <span class="cart-count" data-cart-count>0</span>';
    trigger.setAttribute("aria-label", "Open shopping bag");
    document.body.append(trigger);
    const dialog = document.createElement("dialog");
    dialog.className = "cart-dialog";
    dialog.dataset.cartDialog = "";
    dialog.setAttribute("aria-labelledby", "cart-title");
    dialog.innerHTML = '<div class="cart-dialog-head"><h2 id="cart-title">Your bag</h2><button type="button" class="cart-close" data-cart-close aria-label="Close bag">×</button></div><p class="cart-empty" data-cart-empty>Your bag is empty. Add an item from the collection.</p><div class="cart-items" data-cart-items></div><div class="cart-total"><span>Estimated total</span><strong data-cart-total>KSh 0</strong></div><p class="cart-disclaimer">Final availability and delivery details are confirmed on WhatsApp.</p><button type="button" class="shop-button cart-checkout" data-cart-checkout>Continue on WhatsApp</button>';
    document.body.append(dialog);
  }
  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-to-cart]");
    if (add) {
      const product = inventory.find((item) => item.id === add.dataset.addToCart);
      if (product && Number(cart[product.id] || 0) < Number(product.stock)) {
        setCart({ ...cart, [product.id]: Number(cart[product.id] || 0) + 1 });
        add.textContent = "Added to bag";
        setTimeout(() => { if (add.isConnected) add.textContent = "Add to bag"; }, 1200);
      }
    }
    const change = event.target.closest("[data-cart-change]");
    if (change) {
      const id = change.dataset.cartChange;
      const product = inventory.find((item) => item.id === id);
      const qty = Number(cart[id] || 0) + Number(change.dataset.change);
      if (qty <= 0) { const next = { ...cart }; delete next[id]; setCart(next); }
      else if (product && qty <= product.stock) setCart({ ...cart, [id]: qty });
    }
    if (event.target.closest("[data-cart-open]")) document.querySelector("[data-cart-dialog]")?.showModal();
    if (event.target.closest("[data-cart-close]")) document.querySelector("[data-cart-dialog]")?.close();
    if (event.target.matches("[data-cart-dialog]")) event.target.close();
    if (event.target.closest("[data-cart-checkout]")) {
      const items = cartItems();
      if (!items.length) return;
      const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const lines = items.map(({ product, quantity }) => `• ${product.name} × ${quantity} — ${money(product.price * quantity)}`);
      const message = `Hello EMTO COLLECTIONS, I would like to order:\n${lines.join("\n")}\nEstimated total: ${money(total)}\nPlease confirm availability and delivery options.`;
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
  });
  if (!(await initializeInventory())) return;
  renderCatalogs();
  renderCart();

  // Search products and collection cards from any page.
  const searchInput = document.querySelector('.search-bar input[name="q"]');
  if (searchInput) {
    const params = new URLSearchParams(location.search);
    const rawQuery = params.get("q") || "";
    const query = rawQuery.trim().toLocaleLowerCase();
    searchInput.value = rawQuery;
    if (query) {
      let visibleCategories = 0;
      document.querySelectorAll(".category-card[data-search]").forEach((card) => {
        const matches = `${card.dataset.search} ${card.textContent}`.toLocaleLowerCase().includes(query);
        card.hidden = !matches;
        if (matches) visibleCategories += 1;
      });
      document.querySelectorAll("[data-product-search]").forEach((card) => {
        card.hidden = !card.dataset.productSearch.includes(query);
      });
      const status = document.getElementById("search-status");
      if (status) status.textContent = `Showing results for “${rawQuery.trim()}”.`;
      const empty = document.getElementById("search-empty");
      const productsVisible = [...document.querySelectorAll("[data-product-search]")].some((card) => !card.hidden);
      if (empty) empty.hidden = visibleCategories > 0 || productsVisible;
    }
  }

  // Local inventory admin and export/restore backup controls.
  if (!adminForm) return;
  const adminList = document.querySelector("[data-admin-products]");
  const feedback = document.querySelector("[data-admin-feedback]");
  const editing = adminForm.elements.namedItem("productId");
  const submitButton = adminForm.querySelector('[type="submit"]');
  const resetForm = () => {
    adminForm.reset();
    editing.value = "";
    submitButton.textContent = "Add product to shop";
  };
  const renderAdmin = () => {
    adminList.replaceChildren();
    if (!inventory.length) {
      const note = document.createElement("p");
      note.className = "admin-empty";
      note.textContent = "No products yet. Use the form to add your first item.";
      adminList.append(note);
      return;
    }
    inventory.forEach((product) => {
      const row = document.createElement("article");
      row.className = "admin-product-row";
      const image = document.createElement("img");
      image.src = product.image || categories[product.category]?.image || "";
      image.alt = "";
      const details = document.createElement("div");
      details.className = "admin-product-details";
      const name = document.createElement("h3");
      name.textContent = product.name;
      const meta = document.createElement("p");
      meta.textContent = `${categories[product.category]?.label || "Collection"} · ${money(product.price)} · Stock: ${product.stock}`;
      details.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "admin-row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "admin-secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        adminForm.elements.namedItem("name").value = product.name;
        adminForm.elements.namedItem("category").value = product.category;
        adminForm.elements.namedItem("price").value = product.price;
        adminForm.elements.namedItem("stock").value = product.stock;
        adminForm.elements.namedItem("description").value = product.description || "";
        editing.value = product.id;
        submitButton.textContent = "Save changes";
        adminForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-delete";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!confirm(`Remove “${product.name}” from the shop?`)) return;
        const nextInventory = inventory.filter((item) => item.id !== product.id);
        try {
          await persistInventory(nextInventory);
        } catch (error) {
          feedback.textContent = error.message;
          return;
        }
        const nextCart = { ...cart };
        delete nextCart[product.id];
        save(KEYS.cart, nextCart);
        cart = nextCart;
        renderAdmin(); renderCatalogs(); renderCart();
      });
      actions.append(edit, remove);
      row.append(image, details, actions);
      adminList.append(row);
    });
  };

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedback.textContent = "";
    const data = new FormData(adminForm);
    const old = inventory.find((item) => item.id === editing.value);
    const file = data.get("image");
    let image = old?.image || categories[data.get("category")].image;
    if (file instanceof File && file.size) {
      if (!file.type.startsWith("image/")) { feedback.textContent = "Choose an image file."; return; }
      if (file.size > 8 * 1024 * 1024) { feedback.textContent = "Choose an image under 8 MB."; return; }
      try { image = await compressImage(file); }
      catch { feedback.textContent = "The selected photo could not be opened. Try a JPG or PNG."; return; }
    }
    const product = {
      id: old?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: String(data.get("name")).trim(),
      category: String(data.get("category")),
      price: Number(data.get("price")),
      stock: Number(data.get("stock")),
      description: String(data.get("description")).trim(),
      image,
    };
    if (!product.name || !categories[product.category] || !Number.isFinite(product.price) || product.price <= 0 || !Number.isInteger(product.stock) || product.stock < 0) {
      feedback.textContent = "Enter a product name, category, price above zero and whole-number stock (zero is allowed).";
      return;
    }
    const nextInventory = old
      ? inventory.map((item) => item.id === old.id ? product : item)
      : [...inventory, product];
    try {
      await persistInventory(nextInventory);
      resetForm();
      feedback.textContent = old ? "Product updated." : "Product added to the shop.";
      renderAdmin(); renderCatalogs(); renderCart();
    } catch (error) {
      feedback.textContent = error.message || "Could not save inventory.";
    }
  });
  document.querySelector("[data-reset-form]")?.addEventListener("click", resetForm);
  document.querySelector("[data-export-inventory]")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 1, inventory }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "emto-inventory-backup.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.querySelector("[data-import-inventory]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const restored = Array.isArray(parsed) ? parsed : parsed.inventory;
      if (!Array.isArray(restored) || restored.some((product) => !product.id || !product.name || !categories[product.category] || Number(product.price) <= 0 || !Number.isInteger(Number(product.stock)))) {
        throw new Error("Invalid inventory backup format.");
      }
      if (!confirm("Restore this backup? It will replace the inventory saved on this shop server.")) return;
      await persistInventory(restored);
      feedback.textContent = "Inventory backup restored.";
      renderAdmin(); renderCatalogs(); renderCart();
    } catch (error) {
      feedback.textContent = error.message === "Invalid inventory backup format." ? error.message : "Could not read that backup file.";
    } finally {
      event.target.value = "";
    }
  });
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try { await fetch("/api/admin/logout", { method: "POST" }); }
    finally { location.replace("/login.html"); }
  });
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", .78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); };
      img.src = url;
    });
  }
  renderAdmin();
})();
