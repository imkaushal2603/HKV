import { useState, useEffect, useRef } from "react";
import { FaPaperclip } from "react-icons/fa";
import { GoArrowRight, GoArrowUp } from "react-icons/go";
import { IoMdClose } from "react-icons/io";
import { FiExternalLink } from "react-icons/fi";
import { FaExpand } from "react-icons/fa";
import { BiCollapse } from "react-icons/bi";
import "./App.css";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const popupRef = useRef(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesContainerRef = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Auto-open popup after 7 seconds if user hasn't opened it
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen((prev) => {
        if (!prev) return true; // Only open if not already open
        return prev;
      });
    }, 7000); // 7 seconds
    return () => clearTimeout(timer);
  }, []);

  // Close popup on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    else document.removeEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          language: navigator.language || "en-US",
          websiteUrl: "https://timelineinternational.com",
          chatHistory: messages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });

      const data = await res.json();
      const resLinks = data.links;
      if (data.isContactForm || resLinks.length == 0) {
        setShowContactForm(true);
      }

      const cleanText = (data.reply || "")
        .replace(/^\*{1,2}Message to user:\*{1,2}\s*/i, "")
        .replace(/<JSON_OUTPUT>[\s\S]*<\/JSON_OUTPUT>/gi, "")
        .trim();

      const links = data.links || [];

      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: cleanText, links },
      ]);

      // if (/name/i.test(cleanText) && /email/i.test(cleanText)) {
      //   setShowContactForm(true);
      // }
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Error contacting server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatMessage = (text) => {
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/(\d+\.\s)(.*?)(?=\d+\.|$)/gs, (match, num, content) => {
        return `<div class="feature-item"><div class="feature-number">${num.trim()}</div><div class="feature-text">${content.trim()}</div></div>`;
      });
    return formatted;
  };

  const submitContactForm = async () => {
    const userDetails = `Name: ${userName}, Email: ${userEmail}`;
    setMessages((prev) => [...prev, { sender: "user", text: userDetails }]);
    setShowContactForm(false);
    setLoading(true);

    try {
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userDetails,
          language: navigator.language || "en-US",
          websiteUrl: "https://timelineinternational.com",
          chatHistory: messages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });
      if (userEmail) {
        await fetch(
          `https://api.hsforms.com/submissions/v3/integration/submit/${import.meta.env.VITE_HUBSPOT_PORTAL_ID}/${import.meta.env.VITE_HUBSPOT_FORM_ID}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: [
                { name: "email", value: userEmail },
                { name: "firstname", value: userName },
              ]
            }),
          }
        );
      }

      const thankYouMessage = `Thanks for reaching out. I see you have an interest in learning more about Timeline. If you have specific questions or a project in mind, our consultants would be more than happy to assist you directly. They can provide personalized guidance based on your needs. Again, I have your email, and a consultant will follow up with you shortly. In the meantime, here are some resources that might be of interest to you: If there’s anything specific you’d like to discuss, please let me know!`;

      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: thankYouMessage },
      ]);
    } catch (err) {
      console.error("Error:", err);
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Error contacting server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button className="chat-hello-btn" onClick={() => setIsOpen(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M19.04 4.48C20.2282 4.48 21.3677 4.952 22.2078 5.79216C23.048 6.63232 23.52 7.77183 23.52 8.96C23.52 7.77183 23.992 6.63232 24.8322 5.79216C25.6723 4.952 26.8118 4.48 28 4.48C26.8118 4.48 25.6723 4.008 24.8322 3.16784C23.992 2.32768 23.52 1.18817 23.52 0C23.52 1.18817 23.048 2.32768 22.2078 3.16784C21.3677 4.008 20.2282 4.48 19.04 4.48ZM13.44 28C13.44 24.4355 14.856 21.017 17.3765 18.4965C19.897 15.976 23.3155 14.56 26.88 14.56C23.3155 14.56 19.897 13.144 17.3765 10.6235C14.856 8.10302 13.44 4.68451 13.44 1.12C13.44 4.68451 12.024 8.10302 9.50351 10.6235C6.98303 13.144 3.56451 14.56 0 14.56C3.56451 14.56 6.98303 15.976 9.50351 18.4965C12.024 21.017 13.44 24.4355 13.44 28Z" fill="url(#paint0_linear_1_360)" />
            <defs>
              <linearGradient id="paint0_linear_1_360" x1="2.70703" y1="7.35" x2="23.539" y2="22.015" gradientUnits="userSpaceOnUse">
                <stop stop-color="#FC7723" />
                <stop offset="1" stop-color="#CE44FF" />
              </linearGradient>
            </defs>
          </svg>  <span className="btn-gradient-text">Hello!</span>
        </button>
      )}

      {isOpen && (
        <div
          className={`chat-popup ${isExpanded ? 'expanded' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
          ref={popupRef}
        >
          <div className="chat-popup-section">
            <div className="chat-header">
              <div className="chat-header-left">
                <span className="chat-title">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M19.04 4.48C20.2282 4.48 21.3677 4.952 22.2078 5.79216C23.048 6.63232 23.52 7.77183 23.52 8.96C23.52 7.77183 23.992 6.63232 24.8322 5.79216C25.6723 4.952 26.8118 4.48 28 4.48C26.8118 4.48 25.6723 4.008 24.8322 3.16784C23.992 2.32768 23.52 1.18817 23.52 0C23.52 1.18817 23.048 2.32768 22.2078 3.16784C21.3677 4.008 20.2282 4.48 19.04 4.48ZM13.44 28C13.44 24.4355 14.856 21.017 17.3765 18.4965C19.897 15.976 23.3155 14.56 26.88 14.56C23.3155 14.56 19.897 13.144 17.3765 10.6235C14.856 8.10302 13.44 4.68451 13.44 1.12C13.44 4.68451 12.024 8.10302 9.50351 10.6235C6.98303 13.144 3.56451 14.56 0 14.56C3.56451 14.56 6.98303 15.976 9.50351 18.4965C12.024 21.017 13.44 24.4355 13.44 28Z" fill="url(#paint0_linear_1_360)" />
                    <defs>
                      <linearGradient id="paint0_linear_1_360" x1="2.70703" y1="7.35" x2="23.539" y2="22.015" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#FC7723" />
                        <stop offset="1" stop-color="#CE44FF" />
                      </linearGradient>
                    </defs>
                  </svg> <span className="btn-gradient-text">Let’s Find the Right Solution for You</span>
                </span>
              </div>

              <div className="chat-header-actions">
                <button
                  className="expand-btn"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <BiCollapse size={18} /> : <FaExpand size={18} />}
                </button>
                <button
                  className="close-btn"
                  onClick={() => {
                    setIsOpen(false);
                    setIsExpanded(false);
                  }}
                  title="Close Chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11 1L1 11M1 1L11 11" stroke="#343A40" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <p className="chat-subtitle">
              Share a bit about your company, your project and your requirements —
              our AI will assist you to find the perfect solution.
            </p>

            <div className="chat-messages" ref={messagesContainerRef}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`chat-bubble ${msg.sender === "user" ? "user-bubble" : "bot-bubble"
                    }`}
                >
                  <div
                    className="bot-message-content"
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
                  />

                  {i === messages.length - 1 &&
                    showContactForm &&
                    msg.sender === "bot" && (
                      <form
                        className="inline-contact-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitContactForm();
                        }}
                      >
                        <div className="contact-form-fields">
                          <input
                            type="text"
                            placeholder="Your Name"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            required
                          />
                          <input
                            type="email"
                            placeholder="Your Email"
                            value={userEmail}
                            onChange={(e) => setUserEmail(e.target.value)}
                            required
                          />
                          <button type="submit" className="icon-btn contact-send-btn">
                            <GoArrowRight />
                          </button>
                        </div>
                      </form>
                    )}
                  {msg.links && msg.links.length > 0 && (
                    <div
                      className={`links-container ${msg.links.length > 4 ? "scrollable" : ""
                        }`}
                    >
                      {msg.links.map((link, j) => (
                        <div key={j} className="link-card">
                          <div className="link-header">
                            <span className="link-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <rect width="24" height="24" rx="12" fill="#FFECD4" />
                                <path d="M9.99999 13.9999L14 9.99992M11.3333 7.9998L11.642 7.64246C12.2672 7.01735 13.1151 6.6662 13.9992 6.66626C14.8833 6.66632 15.7312 7.01759 16.3563 7.6428C16.9814 8.268 17.3326 9.11592 17.3325 10C17.3325 10.8841 16.9812 11.732 16.356 12.3571L16 12.6665M12.6668 15.9999L12.4021 16.3559C11.7696 16.9814 10.9159 17.3322 10.0264 17.3322C9.13689 17.3322 8.28325 16.9814 7.65075 16.3559C7.33899 16.0477 7.09148 15.6806 6.92256 15.276C6.75364 14.8714 6.66666 14.4374 6.66666 13.9989C6.66666 13.5605 6.75364 13.1264 6.92256 12.7218C7.09148 12.3172 7.33899 11.9502 7.65075 11.6419L8.00008 11.3333" stroke="#FC7723" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            </span>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {link.title}
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M9.08333 0.75L0.75 9.08333M9.08333 0.75H1.58333M9.08333 0.75V8.25" stroke="#FC7723" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            </a>
                          </div>
                          <p className="link-desc">{link.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="chat-bubble bot-bubble">Typing...</div>
              )}
            </div>

            <div className="chat-input-container">
              <div className="chat-input-row">
                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    placeholder="Type here"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  />
                  <button className="icon-btn send-btn" onClick={sendMessage}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="14" viewBox="0 0 12 14" fill="none">
                      <path d="M6 1V12.6667M6 1L11 6M6 1L1 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>
                <button className="icon-btn attach-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="18" viewBox="0 0 17 18" fill="none">
                    <path d="M10.47 4.53553L5.0533 9.9522C4.72178 10.2837 4.53553 10.7334 4.53553 11.2022C4.53553 11.671 4.72178 12.1207 5.0533 12.4522C5.38482 12.7837 5.83446 12.97 6.3033 12.97C6.77214 12.97 7.22178 12.7837 7.5533 12.4522L12.97 7.03553C13.633 6.37249 14.0055 5.47322 14.0055 4.53553C14.0055 3.59785 13.633 2.69858 12.97 2.03553C12.3069 1.37249 11.4076 1 10.47 1C9.53229 1 8.63301 1.37249 7.96997 2.03553L2.5533 7.4522C1.55874 8.44676 1 9.79568 1 11.2022C1 12.6087 1.55874 13.9576 2.5533 14.9522C3.54786 15.9468 4.89678 16.5055 6.3033 16.5055C7.70982 16.5055 9.05874 15.9468 10.0533 14.9522L15.47 9.53553" stroke="url(#paint0_linear_1_377)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <defs>
                      <linearGradient id="paint0_linear_1_377" x1="2.39895" y1="5.07019" x2="13.6457" y2="12.4588" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#FC7723" />
                        <stop offset="1" stop-color="#CE44FF" />
                      </linearGradient>
                    </defs>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
