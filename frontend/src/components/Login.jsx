import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import "./Login.css";

function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
        setMessage("Account created successfully! 🎉");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setMessage("Login successful! ✅");
      }
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        setMessage("Email already registered.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Please enter a valid email.");
      } else if (error.code === "auth/weak-password") {
        setMessage("Password should be at least 6 characters.");
      } else if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        setMessage("Invalid email or password.");
      } else {
        setMessage(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="karthikai-auth-container">
      <div className="karthikai-glass-panel">

        {/* KarthikAI Logo */}
<img
  src="/karthikai-logo.png"
  alt="KarthikAI Logo"
  className="karthikai-login-logo"
/>

        <h1 className="karthikai-title">KarthikAI</h1>

        <p className="karthikai-subtitle">
          {isSignup
            ? "Create your AI assistant account"
            : "Welcome back to your AI assistant"}
        </p>

        <form className="karthikai-form" onSubmit={handleSubmit}>

          <div className="input-group">
            <label>Email Address</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="karthikai-btn"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignup
              ? "Create Account"
              : "Login"}
          </button>

        </form>

        {message && (
          <p className="login-message">
            {message}
          </p>
        )}

        <div className="toggle-auth">
          {isSignup
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            type="button"
            className="switch-button"
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage("");
              setEmail("");
              setPassword("");
            }}
          >
            {isSignup ? "Login" : "Sign Up"}
          </button>
        </div>

      </div>
    </div>
  );
}

export default Login;