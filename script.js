(() => {
  const input = document.getElementById("query");

  /* Local shortcut matching. No requests are sent while typing. */
  function initLauncher({ input, form, getShortcuts, getSearchUrl, onChange }) {
    const panel = document.getElementById("launcher-panel");
    const list = document.getElementById("launcher-results");
    const status = document.getElementById("launcher-status");
    let options = [];
    let activeIndex = -1;
    let composing = false;
    let forceSearch = false;

    const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();

    function close() {
      activeIndex = -1;
      forceSearch = false;
      panel.hidden = true;
      document.body.classList.remove("launcher-open");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      status.textContent = "";
      onChange();
    }

    function select(index) {
      // Include the unselected state in the cycle: Enter then means web search.
      activeIndex = ((index + options.length + 2) % (options.length + 1)) - 1;
      [...list.children].forEach((row, position) => {
        row.setAttribute("aria-selected", String(position === activeIndex));
      });
      const active = list.children[activeIndex];
      if (active) {
        input.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function refresh() {
      const query = input.value.trim();
      if (!query || composing || document.activeElement !== input) {
        close();
        return;
      }

      const term = normalize(query);
      const tokens = term.split(/\s+/);
      const matches = getShortcuts().map((item, order) => {
        const name = normalize(item.name);
        const domain = new URL(item.href).hostname.replace(/^www\./, "");
        const haystack = name + " " + domain;
        const score = name === term ? 3 : name.startsWith(term) || domain.startsWith(term) ? 2 : 1;
        return { ...item, domain, order, score, matches: tokens.every(token => haystack.includes(token)) };
      }).filter(item => item.matches).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 5);

      options = matches.map(item => ({ name: item.name, detail: item.domain, href: item.href, icon: item.icon }));
      forceSearch = false;
      if (!options.length) {
        close();
        return;
      }
      const rows = options.map((option, index) => {
        const row = document.createElement("a");
        row.id = "launcher-option-" + index;
        row.className = "launcher-option";
        row.href = option.href;
        row.tabIndex = -1;
        row.setAttribute("role", "option");
        const icon = document.createElement("span");
        icon.className = "launcher-icon";
        icon.setAttribute("aria-hidden", "true");
        if (option.icon) {
          const image = document.createElement("img");
          image.src = option.icon;
          image.alt = "";
          icon.append(image);
        } else {
          icon.textContent = "↗";
        }
        const text = document.createElement("span");
        text.className = "launcher-text";
        const name = document.createElement("span");
        name.className = "launcher-name";
        name.textContent = option.name;
        const detail = document.createElement("span");
        detail.className = "launcher-detail";
        detail.textContent = option.detail;
        text.append(name, detail);
        const action = document.createElement("span");
        action.className = "launcher-action";
        action.textContent = "打开";
        row.append(icon, text, action);
        row.addEventListener("mousedown", event => event.preventDefault());
        return row;
      });
      list.replaceChildren(...rows);
      panel.hidden = false;
      document.body.classList.add("launcher-open");
      input.setAttribute("aria-expanded", "true");
      select(-1);
      status.textContent = `${matches.length} 个匹配网站。回车搜索，按向下键选择网站`;
      onChange();
    }

    input.addEventListener("input", refresh);
    input.addEventListener("focus", refresh);
    input.addEventListener("compositionstart", () => { composing = true; close(); });
    input.addEventListener("compositionend", () => { composing = false; refresh(); });
    input.addEventListener("keydown", event => {
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.key === "Enter") forceSearch = event.shiftKey;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (panel.hidden) refresh();
        if (!panel.hidden) select(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
      }
      if (event.key === "Escape" && !panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const query = input.value.trim();
      if (composing || !query) return;
      const destination = !forceSearch && !panel.hidden ? options[activeIndex]?.href : null;
      forceSearch = false;
      window.location.assign(destination || getSearchUrl(query));
    });
    document.addEventListener("pointerdown", event => {
      if (!form.contains(event.target)) close();
    });
    document.addEventListener("focusin", event => {
      if (event.target !== input && !list.contains(event.target)) close();
    });
    document.addEventListener("shortcuts-changed", refresh);
    return { refresh, close };
  }

  function initSearchFocus() {
    const search = document.getElementById("search-form");
    const menu = document.getElementById("engine-menu");
    const launcher = document.getElementById("launcher-panel");

    function roundedOutline(element) {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, width / 2, height / 2);
      return [
        `M${left + radius} ${top}H${right - radius}`,
        `A${radius} ${radius} 0 0 1 ${right} ${top + radius}V${bottom - radius}`,
        `A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}H${left + radius}`,
        `A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}V${top + radius}`,
        `A${radius} ${radius} 0 0 1 ${left + radius} ${top}Z`
      ].join(" ");
    }

    function updateSearchDimMask() {
      const outline = `M0 0H${document.documentElement.clientWidth}V${window.innerHeight}H0Z`;
      const holes = [roundedOutline(search)];
      if (!menu.hidden) holes.push(roundedOutline(menu));
      if (!launcher.hidden) holes.push(roundedOutline(launcher));
      document.body.style.setProperty("--search-dim-mask", `path(evenodd, "${outline} ${holes.join(" ")}")`);
    }

    function syncFocus() {
      const active = search.contains(document.activeElement) || !menu.hidden;
      if (active) updateSearchDimMask();
      document.body.classList.toggle("search-focused", active);
    }

    search.addEventListener("focusin", syncFocus);
    search.addEventListener("focusout", () => queueMicrotask(syncFocus));
    window.addEventListener("resize", updateSearchDimMask);
    window.addEventListener("scroll", updateSearchDimMask, { passive: true });
    new ResizeObserver(updateSearchDimMask).observe(document.querySelector("main"));
    return syncFocus;
  }

  function initSearch(syncSearchFocus, getShortcuts) {
    const engines = {
      bing: { name: "Bing", action: "https://www.bing.com/search", param: "q" },
      google: { name: "Google", action: "https://www.google.com/search", param: "q" },
      baidu: { name: "百度", action: "https://www.baidu.com/s", param: "wd" }
    };
    const form = document.getElementById("search-form");
    const buttons = [...document.querySelectorAll("[data-engine]")];
    let selected = "bing";
    let launcher = null;
    const engineToggle = document.getElementById("engine-toggle");
    const engineMenu = document.getElementById("engine-menu");
    const engineLogo = document.getElementById("engine-logo");
    const engineLogos = {
      "bing": "<svg height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>Bing<\/title><path d=\"M11.97 7.569a.92.92 0 00-.805.863c-.013.195-.01.209.43 1.347 1 2.59 1.242 3.214 1.283 3.302.099.213.237.413.41.592.134.138.222.212.37.311.26.176.39.224 1.405.527.989.295 1.529.49 1.994.723.603.302 1.024.644 1.29 1.051.191.292.36.815.434 1.342.029.206.029.661 0 .847a2.491 2.491 0 01-.376 1.026c-.1.151-.065.126.081-.058.415-.52.838-1.408 1.054-2.213a6.728 6.728 0 00.102-3.012 6.626 6.626 0 00-3.291-4.53 104.157 104.157 0 00-1.322-.698l-.254-.133a737.941 737.941 0 01-1.575-.827c-.548-.29-.78-.406-.846-.426a1.376 1.376 0 00-.29-.045l-.093.01z\" fill=\"url(#lobe-icons-bing-0-_R_0_)\"><\/path><path d=\"M13.164 17.24a4.385 4.385 0 00-.202.125 511.45 511.45 0 00-1.795 1.115 163.087 163.087 0 01-.989.614l-.463.288a99.198 99.198 0 01-1.502.941c-.326.2-.704.334-1.09.387-.18.024-.52.024-.7 0a2.807 2.807 0 01-1.318-.538 3.665 3.665 0 01-.543-.545 2.837 2.837 0 01-.506-1.141 2.161 2.161 0 00-.041-.182c-.008-.008.006.138.032.33.027.199.085.487.147.733.482 1.907 1.85 3.457 3.705 4.195a6.31 6.31 0 001.658.412c.22.025.844.035 1.074.017 1.054-.08 1.972-.393 2.913-.992a325.28 325.28 0 01.937-.596l.384-.244.684-.435.234-.149.009-.005.025-.017.013-.007.172-.11.597-.38c.76-.481.987-.65 1.34-.998.148-.146.37-.394.381-.425.002-.007.042-.068.088-.136a2.49 2.49 0 00.373-1.023 4.181 4.181 0 000-.847 4.336 4.336 0 00-.318-1.137c-.224-.472-.7-.9-1.383-1.245a2.972 2.972 0 00-.406-.181c-.01 0-.646.392-1.413.87a7089.171 7089.171 0 00-1.658 1.031l-.439.274z\" fill=\"url(#lobe-icons-bing-1-_R_0_)\" fill-rule=\"nonzero\"><\/path><path d=\"M4.003 14.946l.004 3.33.042.193c.134.604.366 1.04.77 1.445a2.701 2.701 0 001.955.814c.536 0 1-.135 1.479-.43l.703-.435.556-.346V8.003c0-2.306-.004-3.675-.012-3.782a2.734 2.734 0 00-.797-1.765c-.145-.144-.268-.24-.637-.496A1780.102 1780.102 0 015.762.362C5.406.115 5.38.098 5.271.059a.943.943 0 00-1.254.696C4.003.818 4 1.659 4 6.223v5.394H4l.003 3.329z\" fill=\"url(#lobe-icons-bing-2-_R_0_)\" fill-rule=\"nonzero\"><\/path><defs><radialGradient cx=\"93.717%\" cy=\"77.818%\" fx=\"93.717%\" fy=\"77.818%\" gradientTransform=\"scale(-1 -.7146) rotate(49.288 2.035 -2.198)\" id=\"lobe-icons-bing-0-_R_0_\" r=\"143.691%\"><stop offset=\"0%\" stop-color=\"#00CACC\"><\/stop><stop offset=\"100%\" stop-color=\"#048FCE\"><\/stop><\/radialGradient><radialGradient cx=\"13.893%\" cy=\"71.448%\" fx=\"13.893%\" fy=\"71.448%\" gradientTransform=\"scale(.6042 1) rotate(-23.34 .184 .494)\" id=\"lobe-icons-bing-1-_R_0_\" r=\"149.21%\"><stop offset=\"0%\" stop-color=\"#00BBEC\"><\/stop><stop offset=\"100%\" stop-color=\"#2756A9\"><\/stop><\/radialGradient><linearGradient id=\"lobe-icons-bing-2-_R_0_\" x1=\"50%\" x2=\"50%\" y1=\"0%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"#00BBEC\"><\/stop><stop offset=\"100%\" stop-color=\"#2756A9\"><\/stop><\/linearGradient><\/defs><\/svg>",
      "google": "<svg height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>Google<\/title><path d=\"M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z\" fill=\"#4285F4\"><\/path><path d=\"M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z\" fill=\"#34A853\"><\/path><path d=\"M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z\" fill=\"#FBBC05\"><\/path><path d=\"M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z\" fill=\"#EB4335\"><\/path><\/svg>",
      "baidu": "<svg height=\"1em\" style=\"flex:none;line-height:1\" viewBox=\"0 0 24 24\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><title>Baidu<\/title><path d=\"M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z\" fill=\"#2932E1\" fill-rule=\"nonzero\"><\/path><\/svg>"
    };
    buttons.forEach(button => {
      const mark = document.createElement("span");
      mark.className = "engine-brand";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = engineLogos[button.dataset.engine];
      button.prepend(mark);
    });
    function setEngineMenu(open, focusOption = false) {
      if (open) launcher?.close();
      engineMenu.hidden = !open;
      engineToggle.setAttribute("aria-expanded", String(open));
      if (open && focusOption) buttons.find(button => button.dataset.engine === selected).focus();
      syncSearchFocus();
    }
    engineToggle.addEventListener("click", () => setEngineMenu(engineMenu.hidden, true));
    engineToggle.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setEngineMenu(true, true);
      }
    });
    document.addEventListener("click", event => {
      if (!event.target.closest(".engine-picker")) setEngineMenu(false);
    });
    document.addEventListener("focusin", event => {
      if (!event.target.closest(".engine-picker")) setEngineMenu(false);
    });
    engineMenu.addEventListener("keydown", event => {
      const index = buttons.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
    document.querySelector(".engine-picker").addEventListener("keydown", event => {
      if (event.key === "Escape" && !engineMenu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        setEngineMenu(false);
        engineToggle.focus();
      }
    });

    try {
      const saved = localStorage.getItem("startpage-engine");
      if (saved && Object.hasOwn(engines, saved)) selected = saved;
    } catch (_) { }

    function selectEngine(name) {
      if (!Object.hasOwn(engines, name)) return;
      selected = name;
      engineLogo.innerHTML = engineLogos[name];
      const label = engines[name].name + " · 切换搜索引擎";
      engineToggle.setAttribute("aria-label", label);
      engineToggle.title = label;
      buttons.forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.engine === name));
      });
      try { localStorage.setItem("startpage-engine", name); } catch (_) { }
      launcher?.refresh();
    }

    buttons.forEach(button => {
      button.addEventListener("click", () => {
        selectEngine(button.dataset.engine);
        setEngineMenu(false);
        input.focus();
      });
    });

    launcher = initLauncher({
      input,
      form,
      getShortcuts,
      onChange: syncSearchFocus,
      getSearchUrl(term) {
        const engine = engines[selected];
        const url = new URL(engine.action);
        url.searchParams.set(engine.param, term);
        return url.href;
      }
    });

    selectEngine(selected);
  }

  function initQuickLinks() {
    const quickLinks = document.querySelector(".links");
    const addLinkButton = document.getElementById("add-link");
    const linkDialog = document.getElementById("link-dialog");
    const linkForm = document.getElementById("link-form");
    const linkDialogTitle = document.getElementById("link-dialog-title");
    const linkNameInput = document.getElementById("link-name-input");
    const linkUrlInput = document.getElementById("link-url-input");
    const linkSvgInput = document.getElementById("link-svg-input");
    const linkSvgPreview = document.getElementById("link-svg-preview");
    const linkStatus = document.getElementById("link-status");
    const deleteLinkButton = document.getElementById("link-delete");
    const linksKey = "startpage-links";
    const legacyLinksKey = "startpage-custom-links";
    const defaultLinkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13.5a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1.8 1.8"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1.8-1.8"/></svg>';
    let links = [];
    let editingLinkIndex = -1;
    let dialogOpener = null;
    let heldLink = null;
    let suppressLinkClickUntil = 0;

    function validLinkUrl(value) {
      const raw = value.trim();
      if (!raw || (raw.includes("://") && !/^https?:\/\//i.test(raw))) return null;
      try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
        return url.href;
      } catch (_) {
        return null;
      }
    }

    function validSvg(value) {
      const raw = typeof value === "string" ? value.trim() : "";
      if (!raw) return defaultLinkSvg;
      if (raw.length > 1000000) return null;
      const svg = /<svg\b[^>]*\bxmlns\s*=/i.test(raw)
        ? raw : raw.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      if (parsed.documentElement.localName !== "svg" ||
        parsed.documentElement.namespaceURI !== "http://www.w3.org/2000/svg" ||
        parsed.getElementsByTagName("parsererror").length) return null;
      return svg;
    }

    function svgImageUrl(svg) {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\bcurrentColor\b/g, "#cbd4e4"));
    }

    function normalizedLink(item) {
      if (!item || typeof item.name !== "string" || typeof item.href !== "string") return null;
      const name = item.name.trim().slice(0, 32);
      const href = validLinkUrl(item.href);
      const svg = validSvg(item.svg);
      return name && href ? { name, href, svg: svg || defaultLinkSvg } : null;
    }

    function readLinks() {
      try {
        const saved = localStorage.getItem(linksKey);
        if (saved !== null) {
          const data = JSON.parse(saved);
          return Array.isArray(data) ? data.map(normalizedLink).filter(Boolean) : [];
        }
        const legacy = JSON.parse(localStorage.getItem(legacyLinksKey) || "[]");
        const oldLinks = Array.isArray(legacy) ? legacy.map(normalizedLink).filter(Boolean) : [];
        return oldLinks;
      } catch (_) {
        return [];
      }
    }

    function renderLinks() {
      quickLinks.querySelectorAll(".link-entry").forEach(card => card.remove());
      links.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "link-entry";
        wrapper.dataset.index = String(index);
        const link = document.createElement("a");
        link.className = "link-card";
        link.href = item.href;
        link.title = item.name;
        const icon = document.createElement("span");
        icon.className = "icon-box";
        icon.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        image.src = svgImageUrl(item.svg);
        icon.append(image);
        const name = document.createElement("span");
        name.className = "link-name";
        name.textContent = item.name;
        link.append(icon, name);
        link.addEventListener("pointerdown", event => holdLink(event, wrapper));
        link.addEventListener("dragstart", event => event.preventDefault());
        const edit = document.createElement("button");
        edit.className = "link-edit";
        edit.type = "button";
        edit.setAttribute("aria-label", "编辑 " + item.name);
        edit.title = "编辑 " + item.name;
        edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l11-11a2 2 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
        edit.addEventListener("click", () => openLinkDialog(index, edit));
        wrapper.append(link, edit);
        quickLinks.append(wrapper);
      });
      quickLinks.append(addLinkButton);
      quickLinks.classList.toggle("is-empty", links.length === 0);
      document.dispatchEvent(new Event("shortcuts-changed"));
    }

    function holdLink(event, wrapper) {
      if (heldLink || (event.pointerType === "mouse" && event.button !== 0)) return;
      const state = {
        pointerId: event.pointerId,
        wrapper,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        ghost: null,
        timer: null
      };
      heldLink = state;
      state.timer = setTimeout(() => {
        if (heldLink !== state) return;
        const rect = wrapper.getBoundingClientRect();
        state.offsetX = state.startX - rect.left;
        state.offsetY = state.startY - rect.top;
        state.ghost = wrapper.querySelector(".link-card").cloneNode(true);
        state.ghost.classList.add("link-drag-ghost");
        state.ghost.style.width = rect.width + "px";
        state.ghost.style.height = rect.height + "px";
        state.ghost.style.left = rect.left + "px";
        state.ghost.style.top = rect.top + "px";
        document.body.append(state.ghost);
        wrapper.classList.add("is-dragging");
        document.body.classList.add("is-link-dragging");
        state.active = true;
        input.blur();
        state.lastSwap = 0;
      }, 420);
      document.addEventListener("pointermove", moveHeldLink, { passive: false });
      document.addEventListener("pointerup", dropHeldLink);
      document.addEventListener("pointercancel", cancelHeldLink);
      window.addEventListener("blur", cancelHeldLink);
    }

    function moveHeldLink(event) {
      const state = heldLink;
      if (!state || event.pointerId !== state.pointerId) return;
      if (!state.active) {
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 9) finishHeldLink(false);
        return;
      }
      event.preventDefault();
      state.ghost.style.left = event.clientX - state.offsetX + "px";
      state.ghost.style.top = event.clientY - state.offsetY + "px";
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".link-entry");
      if (!target || target.parentElement !== quickLinks || target === state.wrapper) return;
      const now = performance.now();
      if (now - state.lastSwap < 180) return;
      const bounds = target.getBoundingClientRect();
      const inset = Math.min(bounds.width, bounds.height) * .15;
      if (event.clientX < bounds.left + inset || event.clientX > bounds.right - inset ||
          event.clientY < bounds.top + inset || event.clientY > bounds.bottom - inset) return;
      const entries = [...quickLinks.querySelectorAll(".link-entry")];
      const positions = new Map(entries.map(entry => [entry, { x: entry.offsetLeft, y: entry.offsetTop }]));
      entries.forEach(entry => entry.getAnimations().forEach(animation => animation.cancel()));
      if (entries.indexOf(state.wrapper) < entries.indexOf(target)) target.after(state.wrapper);
      else quickLinks.insertBefore(state.wrapper, target);
      state.lastSwap = now;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      entries.forEach(entry => {
        if (entry === state.wrapper) return;
        const before = positions.get(entry);
        const x = before.x - entry.offsetLeft;
        const y = before.y - entry.offsetTop;
        if (x || y) entry.animate([
          { transform: `translate(${x}px, ${y}px)` },
          { transform: "translate(0, 0)" }
        ], { duration: 180, easing: "cubic-bezier(.22, 1, .36, 1)" });
      });
    }

    function finishHeldLink(commit) {
      const state = heldLink;
      if (!state) return;
      heldLink = null;
      clearTimeout(state.timer);
      document.removeEventListener("pointermove", moveHeldLink);
      document.removeEventListener("pointerup", dropHeldLink);
      document.removeEventListener("pointercancel", cancelHeldLink);
      window.removeEventListener("blur", cancelHeldLink);
      if (!state.active) return;
      suppressLinkClickUntil = performance.now() + 800;
      const originalIndex = Number(state.wrapper.dataset.index);
      let destinationIndex = originalIndex;
      state.wrapper.classList.remove("is-dragging");
      document.body.classList.remove("is-link-dragging");
      if (commit) {
        const reordered = [...quickLinks.querySelectorAll(".link-entry")]
          .map(entry => links[Number(entry.dataset.index)]);
        try {
          localStorage.setItem(linksKey, JSON.stringify(reordered));
          destinationIndex = [...quickLinks.querySelectorAll(".link-entry")].indexOf(state.wrapper);
          links = reordered;
        } catch (error) {
          console.error("保存快捷链接顺序失败", error);
        }
      }
      renderLinks();
      const destination = quickLinks.querySelectorAll(".link-entry")[destinationIndex];
      if (!commit || !destination || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        state.ghost.remove();
        return;
      }
      const targetRect = destination.getBoundingClientRect();
      destination.style.visibility = "hidden";
      const landing = state.ghost.animate([
        { transform: "scale(1.025)" },
        { transform: `translate(${targetRect.left - parseFloat(state.ghost.style.left)}px, ${targetRect.top - parseFloat(state.ghost.style.top)}px) scale(1)` }
      ], { duration: 180, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" });
      landing.finished.catch(() => {}).finally(() => {
        destination.style.visibility = "";
        state.ghost.remove();
      });
    }

    function dropHeldLink(event) {
      if (heldLink && event.pointerId === heldLink.pointerId) finishHeldLink(true);
    }

    function cancelHeldLink(event) {
      if (heldLink && (event.pointerId === undefined || event.pointerId === heldLink.pointerId)) finishHeldLink(false);
    }

    function updateSvgPreview() {
      const svg = validSvg(linkSvgInput.value);
      if (svg) linkSvgPreview.src = svgImageUrl(svg);
      else linkSvgPreview.removeAttribute("src");
    }

    function openLinkDialog(index, opener) {
      editingLinkIndex = index;
      dialogOpener = opener;
      linkDialogTitle.textContent = index < 0 ? "添加链接" : "编辑链接";
      deleteLinkButton.hidden = index < 0;
      linkNameInput.value = index < 0 ? "" : links[index].name;
      linkUrlInput.value = index < 0 ? "" : links[index].href;
      linkSvgInput.value = index < 0 ? "" : links[index].svg;
      linkNameInput.setCustomValidity("");
      linkUrlInput.setCustomValidity("");
      linkSvgInput.setCustomValidity("");
      linkStatus.hidden = true;
      updateSvgPreview();
      linkDialog.showModal();
      linkNameInput.focus();
    }

    function saveLinks(next) {
      try {
        localStorage.setItem(linksKey, JSON.stringify(next));
      } catch (_) {
        linkStatus.textContent = "浏览器未能保存链接，请检查本地存储权限。";
        linkStatus.hidden = false;
        return;
      }
      links = next;
      renderLinks();
      const cards = quickLinks.querySelectorAll(".link-entry .link-card");
      const focusIndex = editingLinkIndex < 0 ? cards.length - 1 : Math.min(editingLinkIndex, cards.length - 1);
      dialogOpener = cards[focusIndex] || input;
      linkDialog.close();
    }

    links = readLinks();
    renderLinks();
    quickLinks.addEventListener("click", event => {
      if (performance.now() < suppressLinkClickUntil && event.target.closest(".link-card")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    quickLinks.addEventListener("contextmenu", event => {
      if (heldLink?.active && event.target.closest(".link-card")) event.preventDefault();
    });
    addLinkButton.addEventListener("click", () => openLinkDialog(-1, addLinkButton));
    document.getElementById("link-cancel").addEventListener("click", () => linkDialog.close());
    linkDialog.addEventListener("close", () => {
      if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
      else input.focus({ preventScroll: true });
    });
    linkNameInput.addEventListener("input", () => linkNameInput.setCustomValidity(""));
    linkUrlInput.addEventListener("input", () => {
      linkUrlInput.setCustomValidity("");
      linkStatus.hidden = true;
    });
    linkSvgInput.addEventListener("input", () => {
      linkSvgInput.setCustomValidity("");
      linkStatus.hidden = true;
      updateSvgPreview();
    });
    linkForm.addEventListener("submit", event => {
      event.preventDefault();
      const name = linkNameInput.value.trim();
      const href = validLinkUrl(linkUrlInput.value);
      const svg = validSvg(linkSvgInput.value);
      if (!name) {
        linkNameInput.setCustomValidity("请输入名称");
        linkNameInput.reportValidity();
        return;
      }
      if (!href) {
        linkUrlInput.setCustomValidity("请输入有效的 http 或 https 网址");
        linkUrlInput.reportValidity();
        return;
      }
      if (!svg) {
        linkSvgInput.setCustomValidity("请输入完整有效的 SVG 代码");
        linkSvgInput.reportValidity();
        return;
      }
      const next = [...links];
      if (editingLinkIndex < 0) next.push({ name, href, svg });
      else next[editingLinkIndex] = { name, href, svg };
      saveLinks(next);
    });
    deleteLinkButton.addEventListener("click", () => {
      if (editingLinkIndex < 0) return;
      saveLinks(links.filter((_, index) => index !== editingLinkIndex));
    });
    window.addEventListener("storage", event => {
      if (event.key !== linksKey) return;
      finishHeldLink(false);
      links = readLinks();
      renderLinks();
      if (linkDialog.open) linkDialog.close();
    });
    return () => links.map(item => ({ ...item, icon: svgImageUrl(item.svg) }));
  }

  function initWallpapers(onWallpaper) {
    const wallpapers = window.STARTPAGE_WALLPAPERS || [];
    const wallpaperLayers = [...document.querySelectorAll(".wallpaper")];
    const wallpaperRoot = document.getElementById("wallpapers");
    const previousButton = document.getElementById("wallpaper-prev");
    const nextButton = document.getElementById("wallpaper-next");
    const playButton = document.getElementById("wallpaper-play");
    const visibilityButton = document.getElementById("wallpaper-visibility");
    const visibilitySlash = document.getElementById("visibility-slash");
    const page = document.querySelector(".page");
    const playbackShape = document.getElementById("playback-shape");
    const pausePath = "M6 5h4v14H6zM14 5h4v14h-4z";
    const playPath = "M7 4.8a1 1 0 0 1 1.53-.85l10.5 7.2a1 1 0 0 1 0 1.7l-10.5 7.2A1 1 0 0 1 7 19.2V4.8Z";
    const intervalMs = 30_000;
    let wallpaperIndex = Math.max(0, wallpapers.findIndex(item => item.key === "misty-lake.png"));
    let requestedIndex = 0;
    let activeLayer = 0;
    let requestId = 0;
    let timer = null;
    let playing = true;
    let pendingAutomatic = false;
    let hasWallpaper = false;
    try {
      const savedKey = localStorage.getItem("startpage-wallpaper-key");
      const keyIndex = wallpapers.findIndex(item => item.key === savedKey);
      const savedIndexValue = localStorage.getItem("startpage-wallpaper-index");
      const savedIndex = savedIndexValue === null ? -1 : Number(savedIndexValue);
      if (keyIndex >= 0) {
        wallpaperIndex = keyIndex;
      } else if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < wallpapers.length) {
        wallpaperIndex = savedIndex;
      }
      const savedPlaying = localStorage.getItem("startpage-wallpaper-playing");
      if (savedPlaying !== null) playing = savedPlaying === "true";
    } catch (_) { }
    requestedIndex = wallpaperIndex;

    function showWallpaper(index, automatic = false) {
      if (!wallpapers.length) return;
      requestedIndex = (index + wallpapers.length) % wallpapers.length;
      const item = wallpapers[requestedIndex];
      const currentRequest = ++requestId;
      pendingAutomatic = automatic;

      const image = new Image();
      image.onload = () => {
        if (currentRequest !== requestId) return;
        if (automatic && !playing) {
          requestedIndex = wallpaperIndex;
          pendingAutomatic = false;
          return;
        }
        const nextLayer = 1 - activeLayer;
        const lowerShade = item.shade;
        const upperShade = Math.min(item.shade + .09, .75);
        wallpaperLayers[nextLayer].style.backgroundImage =
          `linear-gradient(rgba(7, 11, 17, ${lowerShade}), rgba(7, 11, 17, ${upperShade})), url("${item.source}")`;
        wallpaperLayers[nextLayer].classList.add("is-visible");
        wallpaperLayers[activeLayer].classList.remove("is-visible");
        activeLayer = nextLayer;
        wallpaperIndex = requestedIndex;
        pendingAutomatic = false;
        hasWallpaper = true;
        onWallpaper(item.theme);
        try {
          localStorage.setItem("startpage-wallpaper-index", String(wallpaperIndex));
          localStorage.setItem("startpage-wallpaper-key", item.key);
        } catch (_) { }
      };
      image.onerror = () => {
        if (currentRequest !== requestId) return;
        pendingAutomatic = false;
      };
      image.src = item.source;
    }

    function restartTimer() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!playing || wallpapers.length < 2) return;
      timer = setTimeout(() => {
        timer = null;
        if (!playing) return;
        showWallpaper(requestedIndex + 1, true);
        restartTimer();
      }, intervalMs);
    }

    function updatePlayback() {
      const canSwitch = wallpapers.length > 1;
      previousButton.disabled = !canSwitch;
      nextButton.disabled = !canSwitch;
      playButton.disabled = !canSwitch;
      playbackShape.setAttribute("d", playing ? pausePath : playPath);
      playButton.setAttribute("aria-pressed", String(playing));
      const label = playing ? "暂停自动切换" : "开始自动切换";
      playButton.setAttribute("aria-label", label);
      playButton.title = label;
      try { localStorage.setItem("startpage-wallpaper-playing", String(playing)); } catch (_) { }
      restartTimer();
    }

    previousButton.addEventListener("click", () => {
      showWallpaper(requestedIndex - 1);
      restartTimer();
    });
    nextButton.addEventListener("click", () => {
      showWallpaper(requestedIndex + 1);
      restartTimer();
    });
    playButton.addEventListener("click", () => {
      playing = !playing;
      if (!playing && hasWallpaper) {
        if (pendingAutomatic) {
          requestId++; // Cancel only an automatic image load.
          requestedIndex = wallpaperIndex;
          pendingAutomatic = false;
        }
        // Finish the current fade when pausing, then restore it for manual navigation.
        wallpaperLayers.forEach(layer => { layer.style.transition = "none"; });
        void wallpaperRoot.offsetWidth;
        wallpaperLayers.forEach(layer => { layer.style.transition = ""; });
      }
      updatePlayback();
    });
    visibilityButton.addEventListener("click", event => {
      const immersive = document.body.classList.toggle("is-immersive");
      if (immersive) input.blur();
      if (immersive && event.detail > 0) visibilityButton.blur();
      page.inert = immersive;
      visibilitySlash.style.display = immersive ? "none" : "";
      visibilityButton.setAttribute("aria-pressed", String(immersive));
      const label = immersive ? "显示页面内容" : "隐藏页面内容";
      visibilityButton.setAttribute("aria-label", label);
      visibilityButton.title = label;
    });

    showWallpaper(wallpaperIndex);
    updatePlayback();
  }

  function initAppearance() {
    const dialog = document.getElementById("appearance-dialog");
    const toggle = document.getElementById("appearance-toggle");
    const transparency = document.getElementById("surface-transparency");
    const blur = document.getElementById("surface-blur");
    const columns = document.getElementById("link-columns");
    const fill = document.getElementById("surface-color");
    const border = document.getElementById("border-color");
    const defaults = { transparency: 80, blur: 5, columns: 6, fill: "#131922", border: "#ebf2ff" };
    const autoTheme = document.getElementById("theme-auto");
    let palette = null;
    let customColors = false;
    const validColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(", ");
    const hex = channels => "#" + channels.map(channel => channel.toString(16).padStart(2, "0")).join("");
    const storageKey = "startpage-appearance";
    const transparencyValue = document.getElementById("transparency-value");
    const blurValue = document.getElementById("blur-value");
    const columnsValue = document.getElementById("link-columns-value");

    function apply(save = false) {
      const opacity = 1 - Number(transparency.value) / 100;
      const style = document.documentElement.style;
      style.setProperty("--surface-opacity", opacity);
      style.setProperty("--surface-blur", blur.value + "px");
      style.setProperty("--link-columns", columns.value);
      if (autoTheme.checked && palette) {
        fill.value = hex(palette.fill);
        border.value = hex(palette.border);
      }
      if ((autoTheme.checked && palette) || customColors) {
        style.setProperty("--surface-rgb", rgb(fill.value));
        style.setProperty("--border-rgb", rgb(border.value));
      } else {
        style.removeProperty("--surface-rgb");
        style.removeProperty("--border-rgb");
      }
      transparencyValue.value = transparency.value + "%";
      blurValue.value = blur.value + "px";
      columnsValue.value = columns.value + " \u4e2a";
      if (save) {
        try {
          const settings = {
            transparency: Number(transparency.value),
            blur: Number(blur.value),
            columns: Number(columns.value),
            fill: fill.value,
            border: border.value,
            customColors,
            autoTheme: autoTheme.checked
          };
          localStorage.setItem(storageKey, JSON.stringify(settings));
        } catch (_) { }
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      autoTheme.checked = saved?.autoTheme === true;
      if (saved && Number.isFinite(saved.transparency)) transparency.value = saved.transparency;
      if (saved && Number.isFinite(saved.blur)) blur.value = saved.blur;
      if (Number.isInteger(saved?.columns)) columns.value = Math.min(10, Math.max(5, saved.columns));
      if (saved && validColor(saved.fill) && validColor(saved.border)) {
        fill.value = saved.fill;
        border.value = saved.border;
        customColors = saved.customColors === true;
      }
    } catch (_) { }
    apply();
    [transparency, blur, columns].forEach(slider => slider.addEventListener("input", () => apply(true)));
    [fill, border].forEach(picker => picker.addEventListener("input", () => {
      autoTheme.checked = false;
      customColors = true;
      apply(true);
    }));
    toggle.addEventListener("click", () => dialog.showModal());
    let pointerStartedOutside = false;
    function isOutsideDialog(event) {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom;
    }
    dialog.addEventListener("pointerdown", event => {
      pointerStartedOutside = event.target === dialog && isOutsideDialog(event);
    });
    dialog.addEventListener("click", event => {
      if (pointerStartedOutside && event.target === dialog && isOutsideDialog(event)) dialog.close();
      pointerStartedOutside = false;
    });
    document.getElementById("appearance-reset").addEventListener("click", () => {
      transparency.value = defaults.transparency;
      blur.value = defaults.blur;
      columns.value = defaults.columns;
      fill.value = defaults.fill;
      border.value = defaults.border;
      customColors = false;
      autoTheme.checked = false;
      apply(true);
    });
    dialog.addEventListener("close", () => toggle.focus({ preventScroll: true }));

    function updateWallpaperTheme(theme) {
      palette = theme;
      apply();
    }

    autoTheme.addEventListener("change", () => apply(true));
    return updateWallpaperTheme;
  }

  function initDesktop() {
    document.addEventListener("keydown", event => {
      const editing = event.target.closest("input, textarea, select, [contenteditable]");
      if (event.key === "/" && !editing && !document.querySelector("dialog[open]") &&
          !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        input.focus({ preventScroll: true });
      }
      if (event.key === "Escape" && document.activeElement === input) input.blur();
    });
  }

  const updateWallpaperTheme = initAppearance();
  const syncSearchFocus = initSearchFocus();
  const getShortcuts = initQuickLinks();
  initSearch(syncSearchFocus, getShortcuts);
  initWallpapers(updateWallpaperTheme);
  initDesktop();
  input.focus({ preventScroll: true });

})();
