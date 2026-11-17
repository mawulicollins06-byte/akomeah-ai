"use strict";

const App = {
  currentScreen: "home",
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
    this.updateProfile();

    if (window.firebaseAuth) {
      window.firebaseAuth.onAuthStateChanged(firebaseUser => {
        if (firebaseUser) {
          this.user = {
            name: firebaseUser.displayName || "AKOMEAH AI User",
            email: firebaseUser.email || "",
            type: "registered"
          };
        } else {
          this.user = {
            name: "Guest User",
            email: "",
            type: "guest"
          };
        }

        this.saveData();
        this.updateProfile();
      });
    }
  },

  loadData() {
    try {
      this.messages = JSON.parse(
        localStorage.getItem("akomeah_messages") || "[]"
      );
      this.conversations = JSON.parse(
        localStorage.getItem("akomeah_conversations") || "[]"
      );
      this.user = JSON.parse(
        localStorage.getItem("akomeah_user") ||
        JSON.stringify(this.user)
      );
      this.memory = localStorage.getItem("akomeah_memory") || "";
    } catch (error) {
      console.error("Unable to load saved data", error);
    }
  },

  saveData() {
    localStorage.setItem(
      "akomeah_messages",
      JSON.stringify(this.messages)
    );

    localStorage.setItem(
      "akomeah_conversations",
      JSON.stringify(this.conversations)
    );

localStorage.setItem(
  "akomeah_memory",
  this.memory
);
    localStorage.setItem(
      "akomeah_user",
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

  const message = input.value.trim();
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
  input.value = "";
  this.saveData();

  this.addMessage("ai", "AKOMEAH AI is thinking...");
  const loadingIndex = this.messages.length - 1;

  try {
    const response = await fetch(
      "http://127.0.0.1:3000/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          history,
          memory: this.memory
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

    if (name) {
      name.textContent = this.user.name;
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

      this.saveData();
      this.updateProfile();
      this.navigate("home");
      this.showNotice("Your AKOMEAH AI account was created successfully.");
    } catch (error) {
      this.showNotice(error.message);
    }
  },

  async loginWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await window.firebaseAuth.signInWithPopup(provider);

      this.user = {
        name: result.user.displayName || "AKOMEAH AI User",
        email: result.user.email || "",
        type: "registered"
      };

      this.saveData();
      this.updateProfile();
      this.navigate("home");
      this.showNotice("Signed in with Google successfully.");
    } catch (error) {
      this.showNotice("Google sign-in failed: " + error.message);
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

      this.saveData();
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

    notice.textContent = message;
    notice.classList.remove("hidden");
  },

  renderHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    list.replaceChildren();

    if (!this.conversations.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No saved conversations yet.";
      list.appendChild(empty);
      return;
    }

    this.conversations.forEach((conversation, index) => {
      const card = document.createElement("div");
      card.className = "setting-row";

      const details = document.createElement("div");
      const title = document.createElement("strong");
      const firstUserMessage = (conversation.messages || [])
        .find(message => message.role === "user");

      title.textContent = conversation.title ||
        (firstUserMessage ? firstUserMessage.content.slice(0, 35) : "Conversation " + (index + 1));

      const date = document.createElement("p");
      date.className = "muted";
      date.textContent = new Date(conversation.date).toLocaleString();

      details.append(title, date);

      const open = document.createElement("button");
      open.className = "secondary-btn";
      open.textContent = "Open";
      open.onclick = () => this.openConversation(index);

      const remove = document.createElement("button");
      remove.className = "secondary-btn";
      remove.textContent = "Delete";
      remove.onclick = () => this.deleteConversation(index);

      card.append(details, open, remove);
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

    const entries = this.memory.split("\\n").filter(item => item.trim());

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
    const entries = this.memory.split("\\n").filter(item => item.trim());
    entries.splice(index, 1);
    this.memory = entries.join("\\n");
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
  App.init();
});

window.App = App;
