
(function () {
  console.log("✅ embed.js loaded");

  const iframe = document.createElement("iframe");
  // iframe.src = "http://localhost:5173"; // test URL, replace later
  iframe.src = "https://145914055.hs-sites-eu1.com/";
  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style.left = "0px";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.zIndex = "9999";
  iframe.style.border = "none";
  document.body.appendChild(iframe);
})();
