
(function () {
  console.log("✅ embed.js loaded");

  const chatContainer = document.createElement("div");
  chatContainer.id = "hkv_iframe";
  chatContainer.className = "hkv_iframe";

  const iframe = document.createElement("iframe");
  // iframe.src = "http://localhost:5173"; // test URL, replace later
  iframe.src = "https://frontend-a7v3.onrender.com/";
  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style.left = "0px";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.zIndex = "9999";
  iframe.style.border = "none";
  chatContainer.appendChild(iframe);
  const target = document.querySelector(".chatbot_section");
  target.appendChild(chatContainer);
})();
