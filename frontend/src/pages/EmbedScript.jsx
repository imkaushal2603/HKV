import React, { useEffect } from "react";

const EmbedScript = () => {
  useEffect(() => {
    console.log("🧩 React component mounted");

    const script = document.createElement("script");
    script.src = "/embed.js";
    script.async = true;
    script.onload = () => console.log("✅ embed.js loaded via React");
    document.body.appendChild(script);

    return () => {
      console.log("🧩 React component unmounted");
      document.body.removeChild(script);
    };
  }, []);

//   return <div style={{ color: "green", padding: "20px" }}>Embedding script...</div>;
};

export default EmbedScript;
