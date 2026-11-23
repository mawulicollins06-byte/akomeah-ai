"use strict";

const App = {
  currentScreen: "home",
  accountId: null,
  messages: [],
  conversations: [],
  memory: "",
  user: {
    name: "Guest User",
    email: "",
    type: "guest"
  },
  init() {
    this.loadData();
    this.applyTheme();
    this.loadSettings();
    this.updateProfile();

    if (!window.firebaseAuth || !window.firebaseDb) {
      console.warn("Firebase is unavailable.");
      return;
    }

    window.firebaseAuth.onAuthStateChanged(async firebaseUser => {
      const generation = ++this.syncGeneration;
      this.cloudReady = false;
      clearTimeout(this.cloudSaveTimer);

      if (!firebaseUser) {
        this.accountId = null;
        this.loadData();
        this.user = {
          name: "Guest User",
          email: "",
          type: "guest"
        };
        this.updateProfile();
        this.renderMessages();
        this.renderHistory();
        this.renderMemory();
        return;
      }

      this.accountId = firebaseUser.uid;
      this.loadData();
      this.user = {
        name: firebaseUser.displayName || "AKOMEAH AI User",
        email: firebaseUser.email || "",
        type: "registered"
      };
      this.updateProfile();

      try {
        await this.loadCloudData(firebaseUser.uid, generation);
      } catch (error) {
        this.cloudReady = false;
        console.error("Firestore load failed:", error);
        this.showNotice("Signed in, but cloud data could not load.");
      }
    });
  },

  storageKey(name) {
    return this.accountId
      ? `akomeah_user_${this.accountId}_${name}`
      : `akomeah_${name}`;
  },

  loadData() {
    try {
      this.messages = JSON.parse(
        localStorage.getItem(this.storageKey("messages")) || "[]"
      );
      this.conversations = JSON.parse(
        localStorage.getItem(this.storageKey("conversations")) || "[]"
      );
      this.user = JSON.parse(
        localStorage.getItem(this.storageKey("user")) ||
        JSON.stringify(this.user)
      );
      this.memory = localStorage.getItem(this.storageKey("memory")) || "";
    } catch (error) {
      console.error("Unable to load saved data", error);
    }
  },

  saveData() {
    localStorage.setItem(
      this.storageKey("messages"),
      JSON.stringify(this.messages)
    );

    localStorage.setItem(
      this.storageKey("conversations"),
      JSON.stringify(this.conversations)
    );

localStorage.setItem(
  this.storageKey("memory"),
  this.memory
);
    localStorage.setItem(
      this.storageKey("user"),
      JSON.stringify(this.user)
    );
  },

  navigate(screen) {
    document.querySelectorAll(".screen").forEach(element => {
      element.classList.remove("active");
    });

    const target = document.getElementById(screen);

    if (!target) return;

    target.classList.add("active");
    this.currentScreen = screen;

    if (screen === "settings") {
      this.renderMemory();
    }

    if (screen === "history") {
      this.renderHistory();
    }

    document.querySelectorAll(".nav-btn").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.screen === screen
      );
    });
  },

  async sendMessage() {
  const input = document.getElementById("messageInput");

  if (!input) return;

  const message = input.value.trim() || (this.pendingImage ? "Please describe this image." : "");
const history = this.messages
  .filter(item => item.role === "user" || item.role === "ai")
  .slice(-20)
  .map(item => ({
    role: item.role === "ai" ? "model" : "user",
    parts: [{ text: item.content }]
  }));
  if (!message) return;

  this.addMessage("user", message);
  const safeMemoryPattern =
    /^(my favourite|my favorite|i prefer|my preferred|my hobby is|my hobbies are|my goal is|i enjoy)\b/i;

  const sensitivePattern =
    /password|passcode|pin|secret|api key|token|bank|account number|medical|diagnosis|medication|address|phone number/i;

  if (
    safeMemoryPattern.test(message.trim()) &&
    !sensitivePattern.test(message)
  ) {
    const cleanMemory = message.trim();
    const existing = this.memory.split("\n").map(item => item.trim());

    if (!existing.includes(cleanMemory)) {
      this.memory = [...existing.filter(Boolean), cleanMemory]
        .join("\n")
        .slice(-3000);

      this.saveData();
    }
  }
  const imageForRequest = this.pendingImage || null;
  this.pendingImage = null;

  const imagePreview = document.getElementById("chatImagePreview");
  if (imagePreview) {
    imagePreview.replaceChildren();
    imagePreview.hidden = true;
  }

  input.value = "";
  this.saveData();

  if (imageForRequest) {
    const userMessage = [...this.messages].reverse().find(
      item => item.role === "user"
    );
    if (userMessage) {
      userMessage.imageData =
        "data:" + imageForRequest.mimeType + ";base64," +
        imageForRequest.data;
    }
    this.renderMessages();
  }

  this.addMessage("ai", "AKOMEAH AI is thinking...");
  const loadingIndex = this.messages.length - 1;

  try {
    const response = await fetch(
      "https://akomeah-ai.onrender.com/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          history,
          memory: this.memory,
          responseStyle: (this.settings || {}).responseStyle || "Adaptive",
          responseLanguage: (this.settings || {}).responseLanguage || "English",
          image: imageForRequest
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI request failed.");
    }

    this.messages[loadingIndex].content =
      data.reply || "I couldn't generate a response.";

  } catch (error) {
    console.error("AI error:", error);

    this.messages[loadingIndex].content =
      "Sorry, I couldn't connect to AKOMEAH AI. Please try again.";
  }

  this.renderMessages();

  for (const item of this.messages) {
    if (item.imageData) {
      const imageKey = "image_" + item.id;

      try {
        await this.saveChatImage(imageKey, item.imageData);
        item.imageKey = imageKey;
        delete item.imageData;
      } catch (error) {
        console.error("Image storage failed:", error);
        this.showNotice("An image could not be saved for chat history.");
      }
    }
  }

  this.saveData();
},
addMessage(role, content) {
    this.messages.push({
      id: Date.now(),
      role,
      content,
      time: new Date().toISOString()
    });

    this.renderMessages();
  },

  openImageDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("AkomeahChatImages", 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("images")) {
          db.createObjectStore("images", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveChatImage(id, data) {
    const db = await this.openImageDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("images", "readwrite");
      transaction.objectStore("images").put({ id, data });

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  },

  async getChatImage(id) {
    const db = await this.openImageDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("images", "readonly");
      const request = transaction.objectStore("images").get(id);

      request.onsuccess = () => {
        const result = request.result;
        db.close();
        resolve(result ? result.data : null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  },

  renderMessages() {
    const area = document.getElementById("chatMessages");

    if (!area) return;

    area.replaceChildren();

    this.messages.forEach(message => {
      const bubble = document.createElement("div");

      bubble.className =
        "message " + (message.role === "user" ? "user" : "ai");

      if (message.role === "user") {
        bubble.textContent = message.content;

        if (message.imageData || message.imageKey) {
          const image = document.createElement("img");
          image.alt = "Attached image";
          image.className = "sent-image";
          bubble.appendChild(image);

          if (message.imageData) {
            image.src = message.imageData;
          } else {
            this.getChatImage(message.imageKey)
              .then(data => {
                if (data && image.isConnected) image.src = data;
              })
              .catch(error =>
                console.error("Unable to load saved chat image:", error)
              );
          }
        }
      } else if (window.marked && window.DOMPurify) {
        bubble.innerHTML = window.DOMPurify.sanitize(
          window.marked.parse(message.content || "")
        );
      } else {
        bubble.textContent = message.content;
      }

      area.appendChild(bubble);
    });

    area.scrollTop = area.scrollHeight;
  },

  newChat() {
    if (this.messages.length) {
      const firstMessage = this.messages.find(
        message => message.role === "user"
      );

      this.conversations.push({
        title: firstMessage
          ? firstMessage.content.slice(0, 40)
          : "New conversation",
        date: new Date().toISOString(),
        messages: [...this.messages]
      });
    }

    this.messages = [];
    this.saveData();
    this.renderMessages();
    this.navigate("chat");
  },


  loadSettings() {
    try {
      this.settings = JSON.parse(localStorage.getItem("akomeah_settings") || "{}");
    } catch (_) {
      this.settings = {};
    }
    this.settings.responseStyle = this.settings.responseStyle || "Adaptive";
    this.settings.responseLanguage = this.settings.responseLanguage || "English";
    this.renderSettings();
  },

  renderSettings() {
    const style = document.getElementById("responseStyle");
    const language = document.getElementById("responseLanguage");
    if (style) style.value = this.settings.responseStyle;
    if (language) language.value = this.settings.responseLanguage;
  },

  togglePreferenceMenu(type) {
    const menuId = type === "style" ? "styleOptions" : "languageOptions";
    const menu = document.getElementById(menuId);
    if (!menu) return;

    const wasHidden = menu.hidden;

    ["styleOptions", "languageOptions"].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.hidden = true;
    });

    menu.hidden = !wasHidden;
  },

  choosePreference(type, value) {
    const id = type === "style" ? "responseStyle" : "responseLanguage";
    const labelId = type === "style" ? "styleValue" : "languageValue";
    const select = document.getElementById(id);
    const label = document.getElementById(labelId);

    if (!select || !label) return;

    select.value = value;
    label.textContent = value;

    const menuId = type === "style" ? "styleOptions" : "languageOptions";
    const menu = document.getElementById(menuId);
    if (menu) menu.hidden = true;

    this.updateSettings();
  },

  updateSettings() {
    this.settings = this.settings || {};
    const style = document.getElementById("responseStyle");
    const language = document.getElementById("responseLanguage");
    if (style) this.settings.responseStyle = style.value;
    if (language) this.settings.responseLanguage = language.value;
    localStorage.setItem("akomeah_settings", JSON.stringify(this.settings));
    this.showNotice("AI preferences saved.");
  },

  async startVoiceInput() {
    const Speech = window.AkomeahSpeech;

    if (!Speech) {
      this.showNotice("Speech recognition plugin is not loaded.");
      console.error("AKOMEAH AI: Native speech plugin unavailable.");
      return;
    }

    try {
      const permission = await Speech.checkPermissions();

      if (permission.speechRecognition !== "granted") {
        const requested = await Speech.requestPermissions();

        if (requested.speechRecognition !== "granted") {
          this.showNotice("Please allow speech recognition permission.");
          return;
        }
      }

      this.showNotice("Listening... Speak now.");

      const result = await Speech.start({
        language: "en-US",
        maxResults: 1,
        partialResults: false,
        popup: false
      });

      const transcript = result.matches && result.matches[0];

      if (transcript) {
        const input = document.getElementById("messageInput");

        if (input) {
          input.value = transcript;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        this.showNotice("Voice input received.");
      } else {
        this.showNotice("No speech was recognized. Please try again.");
      }
    } catch (error) {
      console.error("AKOMEAH AI native voice error:", error);
      this.showNotice("Voice error: " + (error.message || error));
    }
  },

  handleImageSelection(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const status = document.getElementById("imageStatus");
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.showNotice("Choose a JPEG, PNG or WebP image under 5 MB.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.pendingImage = {
        mimeType: file.type,
        data: String(reader.result).split(",")[1]
      };
      if (status) status.textContent = "";

      const preview = document.getElementById("chatImagePreview");
      if (preview) {
        const image = document.createElement("img");
        image.src = String(reader.result);
        image.alt = "Selected image";
        image.className = "image-preview-img";
        preview.replaceChildren(image);
        preview.hidden = false;
      }
    };
    reader.onerror = () => this.showNotice("Could not read that image.");
    reader.readAsDataURL(file);
    input.value = "";
  },

  applyTheme() {
    const theme = localStorage.getItem("akomeah_theme");

    document.body.classList.toggle("light", theme === "light");
  },

  toggleTheme() {
    const light = document.body.classList.toggle("light");

    localStorage.setItem(
      "akomeah_theme",
      light ? "light" : "dark"
    );
  },

  updateProfile() {
    const name = document.getElementById("profileName");
    const status = document.getElementById("accountStatus");
    const authButton = document.getElementById("authButton");
    const logoutButton = document.getElementById("logoutButton");

    const signedIn = this.user.type === "registered" && !!this.accountId;

    if (authButton) {
      authButton.style.display = signedIn ? "none" : "block";
    }

    if (logoutButton) {
      logoutButton.style.display = signedIn ? "block" : "none";
    }

    if (name) {
      name.textContent = this.user.name || "Guest User";
    }

    if (status) {
      if (this.user.type === "registered" && this.accountId) {
        status.textContent = this.user.email
          ? "Signed in as " + this.user.email
          : "Signed in to your AKOMEAH AI account.";
      } else {
        status.textContent = "Currently using guest access.";
      }
    }
  },

  async registerWithEmail() {
    const name = document.getElementById("authName").value.trim();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;

    if (!name || !email || !password) {
      return this.showNotice("Please fill in all fields.");
    }

    if (password.length < 6) {
      return this.showNotice("Password must be at least 6 characters.");
    }

    try {
      const result = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName: name });

      this.user = {
        name: name,
        email: result.user.email,
        type: "registered"
      };

      this.updateProfile();
      this.navigate("home");
      this.showNotice("Your AKOMEAH AI account was created successfully.");
    } catch (error) {
      this.showNotice(error.message);
    }
  },

  async loginWithEmail() {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;

    if (!email || !password) {
      return this.showNotice("Enter your email and password.");
    }

    try {
      const result = await window.firebaseAuth.signInWithEmailAndPassword(email, password);

      this.user = {
        name: result.user.displayName || "AKOMEAH AI User",
        email: result.user.email,
        type: "registered"
      };

      this.updateProfile();
      this.navigate("home");
      this.showNotice("Welcome back to AKOMEAH AI.");
    } catch (error) {
      this.showNotice(error.message);
    }
  },

  showNotice(message) {
    const notice = document.getElementById("notice");

    if (!notice) {
      alert(message);
      return;
    }

    clearTimeout(this.noticeTimer);

    notice.textContent = message;
    notice.classList.remove("hidden");

    const duration = /error|failed|could not|denied|unavailable|please/i.test(message)
      ? 6000
      : 3500;

    this.noticeTimer = setTimeout(() => {
      notice.classList.add("hidden");
      notice.textContent = "";
    }, duration);
  },

  renderHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    list.replaceChildren();

    const searchInput = document.getElementById("historySearch");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = this.conversations
      .map((conversation, index) => ({ conversation, index }))
      .filter(({ conversation }) => {
        const firstMessage = (conversation.messages || [])
          .find(message => message.role === "user");

        const title = conversation.title ||
          (firstMessage ? firstMessage.content : "New conversation");

        return title.toLowerCase().includes(query) ||
          (firstMessage && firstMessage.content.toLowerCase().includes(query));
      });

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = query
        ? "No conversations match your search."
        : "No saved conversations yet. Start a chat to see it here.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach(({ conversation, index }) => {
      const card = document.createElement("div");
      card.className = "history-item";

      const details = document.createElement("div");
      details.className = "history-details";

      const title = document.createElement("strong");
      const firstUserMessage = (conversation.messages || [])
        .find(message => message.role === "user");

      title.className = "history-title";
      title.textContent = conversation.title ||
        (firstUserMessage
          ? firstUserMessage.content.slice(0, 40)
          : "New conversation");

      const preview = document.createElement("p");
      preview.className = "history-preview";
      preview.textContent = firstUserMessage
        ? firstUserMessage.content.slice(0, 90)
        : "No messages";

      const date = document.createElement("span");
      date.className = "history-date";
      const parsedDate = new Date(conversation.date);
      date.textContent = Number.isNaN(parsedDate.getTime())
        ? ""
        : parsedDate.toLocaleDateString();

      details.append(title, preview, date);

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const open = document.createElement("button");
      open.className = "history-open";
      open.textContent = "Open";
      open.onclick = () => this.openConversation(index);

      const remove = document.createElement("button");
      remove.className = "history-delete";
      remove.textContent = "Delete";
      remove.onclick = () => this.deleteConversation(index);

      actions.append(open, remove);
      card.append(details, actions);
      list.appendChild(card);
    });
  },

  deleteConversation(index) {
    if (!this.conversations[index]) return;

    this.conversations.splice(index, 1);
    this.saveData();
    this.renderHistory();
  },

  openConversation(index) {
    const conversation = this.conversations[index];
    if (!conversation) return;

    this.messages = conversation.messages || [];
    this.saveData();
    this.renderMessages();
    this.navigate("chat");
  },

  renderMemory() {
    const list = document.getElementById("memoryList");
    if (!list) return;

    list.replaceChildren();

    const entries = this.memory.split("\n").filter(item => item.trim());

    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = "No saved memories yet.";
      list.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "setting-row";

      const text = document.createElement("span");
      text.textContent = entry;

      const button = document.createElement("button");
      button.className = "secondary-btn";
      button.textContent = "Delete";
      button.onclick = () => this.deleteMemory(index);

      row.append(text, button);
      list.appendChild(row);
    });
  },

  deleteMemory(index) {
    const entries = this.memory.split("\n").filter(item => item.trim());
    entries.splice(index, 1);
    this.memory = entries.join("\n");
    this.saveData();
    this.renderMemory();
  },

  clearMemory() {
    this.memory = "";
    this.saveData();
    this.renderMemory();
    this.showNotice("All saved memories have been cleared.");
  },

  async logout() {
    try {
      if (window.firebaseAuth) {
        await window.firebaseAuth.signOut();
      }

      this.user = {
        name: "Guest User",
        email: "",
        type: "guest"
      };

      this.saveData();
      this.updateProfile();
      this.navigate("home");
      this.showNotice("You have signed out successfully.");
    } catch (error) {
      this.showNotice("Sign-out failed. Please try again.");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {

/* AKOMEAH_FIRESTORE_CLOUD_SYNC_V2 */
(function () {
  const app = App;
  const localSave = app.saveData.bind(app);

  app.cloudReady = false;
  app.cloudSaveTimer = null;
  app.syncGeneration = 0;

  function userRef(uid) {
    return window.firebaseDb.collection("users").doc(uid);
  }

  app.saveData = function () {
    localSave();
    if (this.cloudReady && this.accountId) this.queueCloudSave();
  };

  app.queueCloudSave = function () {
    if (!this.cloudReady || !this.accountId) return;
    clearTimeout(this.cloudSaveTimer);
    this.cloudSaveTimer = setTimeout(() => {
      this.saveCloudData().catch(error =>
        console.error("Firestore save failed:", error)
      );
    }, 1000);
  };

  app.loadCloudData = async function (uid, generation) {
    const root = userRef(uid);
    const results = await Promise.all([
      root.collection("appData").doc("profile").get(),
      root.collection("appData").doc("activeChat").get(),
      root.collection("conversations").get()
    ]);

    if (generation !== this.syncGeneration || this.accountId !== uid) return;

    const [profile, active, chats] = results;
    const hasData = profile.exists || active.exists || !chats.empty;

    if (hasData) {
      if (profile.exists && profile.data().user) {
        this.user = profile.data().user;
      }

      this.messages = active.exists && Array.isArray(active.data().messages)
        ? active.data().messages : [];

      this.memory = active.exists && typeof active.data().memory === "string"
        ? active.data().memory : "";

      this.conversations = [];
      chats.forEach(doc => {
        this.conversations.push({ ...doc.data(), id: doc.id });
      });

      localSave();
    }

    if (generation !== this.syncGeneration || this.accountId !== uid) return;

    this.cloudReady = true;
    this.updateProfile();
    this.renderMessages();
    this.renderHistory();
    this.renderMemory();

    if (!hasData) this.queueCloudSave();

    console.log("AKOMEAH AI: Firestore ready.");
  };

  app.saveCloudData = async function () {
    const uid = this.accountId;
    if (!uid || !this.cloudReady) return;

    const root = userRef(uid);
    const chatsRef = root.collection("conversations");

    await root.collection("appData").doc("profile").set({
      user: this.user,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await root.collection("appData").doc("activeChat").set({
      messages: this.messages || [],
      memory: this.memory || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const conversations = this.conversations || [];
    const operations = [];

    conversations.forEach(chat => {
      if (!chat.id) {
        chat.id = "chat_" + Date.now().toString(36) +
          "_" + Math.random().toString(36).slice(2, 9);
      }
      operations.push({
        ref: chatsRef.doc(chat.id),
        data: {
          ...chat,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }
      });
    });

    for (let i = 0; i < operations.length; i += 400) {
      const batch = window.firebaseDb.batch();
      operations.slice(i, i + 400).forEach(op => {
        batch.set(op.ref, op.data, { merge: true });
      });
      await batch.commit();
    }

    console.log("AKOMEAH AI: cloud data saved.");
  };
})();

App.init();
});

window.App = App;
