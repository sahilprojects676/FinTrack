import React, { useEffect, useMemo, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import {
  LayoutDashboard, History, CalendarDays, UserRound, LogOut, Bell,
  Search, ArrowUpRight, ArrowDownRight, WalletCards,
  Plus, Trash2, Pencil, Eye, EyeOff, LockKeyhole, Mail, X, Settings,
  Target, TrendingUp, Layers, ShieldCheck, Send, CheckCircle2,
  MessageSquare, RefreshCw, Clock, Users, CreditCard, Database,
  ExternalLink, ChevronRight, Check, Instagram, Github, Camera, Upload, Sparkles,
  ZoomIn, ZoomOut, RotateCw, RotateCcw, Crop, Move,
  Megaphone, CheckCheck, BellRing, Radio, KeyRound
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend
} from "recharts";
import "./styles.css";

const rawApi = import.meta.env.VITE_API_URL || "https://fintrack-emjn.onrender.com/api";
const API = rawApi.replace(/\/+$/, "").endsWith("/api")
  ? rawApi.replace(/\/+$/, "")
  : `${rawApi.replace(/\/+$/, "")}/api`;
const api = axios.create({ baseURL: API });

api.interceptors.request.use(config => {
  const token = localStorage.getItem("fintrack_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const categories = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Other"];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("fintrack_token"));
  const [user, setUser] = useState(null);
  const [verifyingTokenState, setVerifyingTokenState] = useState(null);
  const [resetTokenParam, setResetTokenParam] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("resetPasswordToken") || params.get("resetToken") || null;
  });
  const logout = () => {
    localStorage.removeItem("fintrack_token");
    delete api.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
  };

  const handleLogin = (t, u) => {
    localStorage.setItem("fintrack_token", t);
    api.defaults.headers.common.Authorization = `Bearer ${t}`;
    setToken(t);
    setUser(u);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verifyEmailToken") || params.get("verifyToken");
    if (!verifyToken) return;

    setVerifyingTokenState({
      status: "verifying",
      message: "Verifying your email and activating your FinTrack account..."
    });

    api.post("/auth/verify-signup-link", { token: verifyToken })
      .then(res => {
        window.history.replaceState({}, document.title, window.location.pathname);
        setVerifyingTokenState({
          status: "success",
          message: res.data.alreadyVerified
            ? "Your account is already verified! Logging you in..."
            : "Email confirmed successfully! Your account has been created."
        });
        setTimeout(() => {
          handleLogin(res.data.token, res.data.user);
          setVerifyingTokenState(null);
        }, 1200);
      })
      .catch(err => {
        setVerifyingTokenState({
          status: "error",
          message: err.response?.data?.message || "Verification link is invalid or has expired. Please sign up again."
        });
      });
  }, []);

  useEffect(() => {
    if (!token) return;
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    api.get("/auth/me").then(r => setUser(r.data)).catch(err => {
      if (err.response?.status === 401) logout();
    });
  }, [token]);

  if (verifyingTokenState) {
    return (
      <div className="email-verify-page">
        <div className="card email-verify-card">
          <div className="email-verify-icon-wrap">
            {verifyingTokenState.status === "verifying" && <RefreshCw size={36} className="spin text-emerald" />}
            {verifyingTokenState.status === "success" && <CheckCircle2 size={42} color="#10b981" />}
            {verifyingTokenState.status === "error" && <X size={42} color="#ef4444" />}
          </div>
          <h2>
            {verifyingTokenState.status === "verifying" && "Activating Account..."}
            {verifyingTokenState.status === "success" && "Account Verified!"}
            {verifyingTokenState.status === "error" && "Verification Failed"}
          </h2>
          <p className="muted">{verifyingTokenState.message}</p>
          {verifyingTokenState.status === "error" && (
            <button
              type="button"
              className="primary"
              style={{ marginTop: "16px" }}
              onClick={() => {
                window.history.replaceState({}, document.title, window.location.pathname);
                setVerifyingTokenState(null);
              }}
            >
              Back to Login
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <Login
        onLogin={handleLogin}
        initialResetToken={resetTokenParam}
        onClearResetToken={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setResetTokenParam(null);
        }}
      />
    );
  }

  return <FinanceApp user={user} onLogout={logout} onUpdateUser={setUser} />;
}

function Login({ onLogin, initialResetToken, onClearResetToken }) {
  const [mode, setMode] = useState(() => (initialResetToken ? "reset-token" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  const [emailStatus, setEmailStatus] = useState("idle");
  const [emailMessage, setEmailMessage] = useState("");

  const [linkSentInfo, setLinkSentInfo] = useState(null);

  // Forgot password flow states
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  useEffect(() => {
    if (mode !== "signup") {
      setEmailStatus("idle");
      setEmailMessage("");
      return;
    }

    const trimmed = email.trim();
    const EMAIL_SYNTAX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!trimmed || !EMAIL_SYNTAX.test(trimmed)) {
      setEmailStatus("idle");
      setEmailMessage("");
      return;
    }

    setEmailStatus("checking");
    setEmailMessage("Checking...");

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-email?email=${encodeURIComponent(trimmed)}`);
        if (res.data.available) {
          setEmailStatus("idle");
          setEmailMessage("");
        } else {
          setEmailStatus("unavailable");
          setEmailMessage(`✗ ${res.data.error || "Email not available"}`);
        }
      } catch (err) {
        setEmailStatus("idle");
        setEmailMessage("");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, mode]);

  const handleRequestForgotCode = async e => {
    if (e) e.preventDefault();
    setError("");
    setForgotMessage("");

    let cleanEmail = (forgotEmail || email).trim();
    if (cleanEmail.toLowerCase().includes("entrenceexam")) {
      cleanEmail = cleanEmail.replace(/entrenceexam/i, "entranceexam");
      setForgotEmail(cleanEmail);
    }
    if (!cleanEmail) {
      setError("Please enter your registered email address");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email: cleanEmail });
      setForgotEmail(cleanEmail);
      setForgotStep(2);
      setForgotMessage(data.message || "Reset instructions sent to your email!");
      if (data.demoCode) {
        setResetCode(data.demoCode);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send reset code. Please check your email.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithCode = async e => {
    if (e) e.preventDefault();
    setError("");

    if (!resetCode || resetCode.trim().length !== 6) {
      setError("Please enter the complete 6-digit reset code");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        email: forgotEmail.trim(),
        code: resetCode.trim(),
        newPassword
      });
      setForgotSuccess(true);
      setForgotMessage("Password reset successfully! Logging you in...");
      setTimeout(() => {
        if (data.token && data.user) {
          onLogin(data.token, data.user);
        } else {
          setMode("login");
          setPassword("");
          setError("");
        }
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password. Please check code or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithToken = async e => {
    if (e) e.preventDefault();
    setError("");

    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        token: initialResetToken,
        newPassword
      });
      setForgotSuccess(true);
      setForgotMessage("Password reset successfully! Logging you in...");
      if (onClearResetToken) onClearResetToken();
      setTimeout(() => {
        if (data.token && data.user) {
          onLogin(data.token, data.user);
        } else {
          setMode("login");
          setPassword("");
          setError("");
        }
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async e => {
    e.preventDefault();
    setError("");

    let cleanEmail = email.trim();
    if (cleanEmail.toLowerCase().includes("entrenceexam")) {
      cleanEmail = cleanEmail.replace(/entrenceexam/i, "entranceexam");
      setEmail(cleanEmail);
    }

    if (mode === "login") {
      setLoading(true);
      try {
        const { data } = await api.post("/auth/login", { email: cleanEmail, password });
        localStorage.setItem("fintrack_token", data.token);
        api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
        onLogin(data.token, data.user);
      } catch (err) {
        setError(err.response?.data?.message || "Invalid email or password");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (emailStatus === "unavailable") {
      setError(emailMessage.replace(/^[✗✓]\s*/, "") || "Please enter a valid, active email address");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/request-signup-link", { name, email: cleanEmail, password });
      setLinkSentInfo({
        email: data.email || cleanEmail,
        sentViaEmail: Boolean(data.sentViaEmail),
        verifyUrl: data.verifyUrl || data.demoLink || null
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send verification link. Please check details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <section className="login-brand">
          <div className="login-brand-inner">
            <div className="login-brand-header">
              <div className="brand-logo-combo">
                <img src="/logo-icon.png" alt="FinTrack" className="brand-icon-img" />
                <div className="brand-text-block">
                  <span className="brand-name-title">FinTrack</span>
                  <span className="brand-slogan-text">Manage Smarter. Live Smarter.</span>
                </div>
              </div>
            </div>

            <div className="login-headline-block">
              <h1>
                Your Money,<br />
                Made <span className="highlight-coral">Simple.</span>
              </h1>
              <p className="login-hero-desc">
                Track your income, expenses and achieve your financial goals with ease.
              </p>
            </div>

            <div className="login-feature-pills">
              <div className="feature-pill pill-pink">
                <div className="pill-icon-box">
                  <ArrowUpRight size={22} />
                </div>
                <div className="pill-text-block">
                  <strong>Track</strong>
                  <span>Your Expenses</span>
                </div>
              </div>

              <div className="feature-pill pill-blue">
                <div className="pill-icon-box">
                  <Target size={22} />
                </div>
                <div className="pill-text-block">
                  <strong>Plan</strong>
                  <span>Your Budget</span>
                </div>
              </div>

              <div className="feature-pill pill-green">
                <div className="pill-icon-box">
                  <WalletCards size={22} />
                </div>
                <div className="pill-text-block">
                  <strong>Save</strong>
                  <span>More</span>
                </div>
              </div>

              <div className="feature-pill pill-orange">
                <div className="pill-icon-box">
                  <TrendingUp size={22} />
                </div>
                <div className="pill-text-block">
                  <strong>Achieve</strong>
                  <span>Your Goals</span>
                </div>
              </div>
            </div>

            <div className="login-visual-showcase">
              <div className="slogan-badge-left">
                <span>Smarter Finances,</span>
                <em>Brighter Tomorrow</em>
                <div className="slogan-swoosh"></div>
              </div>

              <div className="showcase-character-wrap">
                <img
                  src="/student-beanbag.jpg"
                  alt="Student Managing Finances"
                  className="showcase-character-img"
                />
              </div>

              <div className="floating-savings-card">
                <div className="savings-card-top">
                  <span className="savings-label">Total Savings</span>
                  <span className="growth-pill">↑ 12%</span>
                </div>
                <div className="savings-amount">₹12,450</div>
                <div className="savings-chart-wrap">
                  <svg viewBox="0 0 140 45" className="sparkline-svg">
                    <defs>
                      <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef476f" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#ef476f" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,38 C25,36 45,30 65,22 C85,15 110,26 140,8 L140,45 L0,45 Z"
                      fill="url(#savingsGrad)"
                    />
                    <path
                      d="M0,38 C25,36 45,30 65,22 C85,15 110,26 140,8"
                      fill="none"
                      stroke="#ef476f"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="savings-card-callout">
                  <span className="script-callout">Small Steps, Big Results ↗</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="login-form-wrap">
          <div className="mobile-brand-logo">
            <img src="/logo-official.png" alt="FinTrack" className="mobile-logo-img" />
          </div>

          {linkSentInfo ? (
            <div className="link-sent-view">
              <div className="link-sent-icon-circle">
                <Mail size={36} color="#10b981" />
              </div>
              <h2>Verification Link Sent!</h2>
              <p className="muted" style={{ marginBottom: "12px" }}>
                To verify this is a real account, we sent an activation link to:
              </p>
              <div className="link-sent-email-badge">
                <Mail size={15} color="#059669" />
                <strong>{linkSentInfo.email}</strong>
              </div>

              <div className="link-sent-info-box">
                <p style={{ margin: "0 0 8px", fontSize: "14px", color: "#1e293b", fontWeight: 600 }}>
                  📬 Verification Link Sent to <span style={{ color: "#059669" }}>{linkSentInfo.email}</span>
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155", lineHeight: "1.4" }}>
                  Please check your <strong>Inbox</strong> (and <strong>Spam / Junk folder</strong>) and click the link to activate your account.
                </p>
                {linkSentInfo.verifyUrl && (
                  <div style={{ marginTop: "14px", padding: "12px", background: "#f0fdf4", border: "1px dashed #10b981", borderRadius: "8px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 8px", fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                      ⚡ Quick Link (Development & Testing):
                    </p>
                    <a
                      href={linkSentInfo.verifyUrl}
                      className="primary"
                      style={{ display: "inline-block", padding: "8px 18px", fontSize: "13px", borderRadius: "6px", textDecoration: "none" }}
                    >
                      Click to Activate Account Now ↗
                    </a>
                  </div>
                )}
              </div>



              <div className="link-sent-actions">
                <button
                  type="button"
                  className="text-sub-btn"
                  disabled={loading}
                  onClick={submit}
                >
                  {loading ? "Resending..." : "Resend Verification Link"}
                </button>
                <button
                  type="button"
                  className="text-sub-btn"
                  onClick={() => {
                    setLinkSentInfo(null);
                    setError("");
                  }}
                >
                  ← Back / Change Email
                </button>
              </div>
            </div>
          ) : mode === "forgot" ? (
            forgotSuccess ? (
              <div className="forgot-success-box" style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ display: "inline-flex", padding: "16px", background: "#ecfdf5", borderRadius: "50%", marginBottom: "16px" }}>
                  <CheckCircle2 size={46} color="#10b981" />
                </div>
                <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Password Reset!</h2>
                <p className="muted" style={{ fontSize: "14px", lineHeight: "1.5" }}>
                  {forgotMessage || "Your password has been successfully updated. Logging you in..."}
                </p>
                <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
                  <RefreshCw size={22} className="spin text-emerald" />
                </div>
              </div>
            ) : forgotStep === 1 ? (
              <>
                <div className="forgot-header-wrap">
                  <div className="forgot-step-badge">
                    <KeyRound size={13} />
                    <span>Password Recovery</span>
                  </div>
                  <h2>Forgot Password?</h2>
                  <p className="muted">
                    Enter your registered email address. We'll send you a 6-digit verification code and reset link.
                  </p>
                </div>

                <form onSubmit={handleRequestForgotCode}>
                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <Mail size={16} /> Registered Email
                      </span>
                    </div>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      required
                    />
                  </label>

                  {error && <div className="error">{error}</div>}

                  <button
                    type="submit"
                    className="primary full"
                    disabled={loading}
                  >
                    {loading ? "Sending Reset Code..." : "Send Reset Code & Link"}
                  </button>
                </form>

                <p className="switch">
                  Remember your password?{" "}
                  <button
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setForgotMessage("");
                    }}
                  >
                    Back to Login
                  </button>
                </p>
              </>
            ) : (
              <>
                <div className="forgot-header-wrap">
                  <div className="forgot-step-badge">
                    <KeyRound size={13} />
                    <span>Step 2 of 2</span>
                  </div>
                  <h2>Set New Password</h2>
                  <p className="muted">
                    We sent a 6-digit code and link to <strong>{forgotEmail}</strong>. Enter the code and your new password:
                  </p>
                </div>

                <form onSubmit={handleResetWithCode}>
                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <KeyRound size={16} /> 6-Digit Reset Code
                      </span>
                      <span style={{ fontSize: "11.5px", color: "#64748b" }}>Valid for 15 mins</span>
                    </div>
                    <input
                      type="text"
                      className="reset-code-input"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="- - - -"
                      maxLength="6"
                      required
                    />
                  </label>

                  <div className="resend-code-subrow">
                    <span className="resend-code-hint">Didn't receive the code?</span>
                    <button
                      type="button"
                      className="resend-code-btn"
                      disabled={loading}
                      onClick={handleRequestForgotCode}
                    >
                      <RefreshCw size={12} className={loading ? "spin" : ""} />
                      <span>{loading ? "Resending..." : "Resend Code"}</span>
                    </button>
                  </div>

                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <LockKeyhole size={16} /> New Password
                      </span>
                    </div>
                    <div className="password">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Enter at least 6 characters"
                        minLength="6"
                        required
                      />
                      <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}>
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>

                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <LockKeyhole size={16} /> Confirm New Password
                      </span>
                    </div>
                    <div className="password">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        minLength="6"
                        required
                      />
                    </div>
                  </label>

                  {error && <div className="error">{error}</div>}
                  {forgotMessage && (
                    <div className="info-banner" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "10px 12px", borderRadius: "8px", fontSize: "12.5px", marginBottom: "14px" }}>
                      {forgotMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="primary full"
                    disabled={loading}
                  >
                    {loading ? "Updating Password..." : "Reset Password & Login"}
                  </button>
                </form>

                <div className="link-sent-actions" style={{ marginTop: "16px", display: "flex", justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="text-sub-btn"
                    onClick={() => {
                      setForgotStep(1);
                      setError("");
                    }}
                  >
                    ← Change Email
                  </button>
                  <button
                    type="button"
                    className="text-sub-btn"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setForgotMessage("");
                    }}
                  >
                    Back to Login
                  </button>
                </div>
              </>
            )
          ) : mode === "reset-token" ? (
            forgotSuccess ? (
              <div className="forgot-success-box" style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ display: "inline-flex", padding: "16px", background: "#ecfdf5", borderRadius: "50%", marginBottom: "16px" }}>
                  <CheckCircle2 size={46} color="#10b981" />
                </div>
                <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Password Reset!</h2>
                <p className="muted" style={{ fontSize: "14px", lineHeight: "1.5" }}>
                  {forgotMessage || "Your password has been successfully updated. Logging you in..."}
                </p>
                <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
                  <RefreshCw size={22} className="spin text-emerald" />
                </div>
              </div>
            ) : (
              <>
                <div className="forgot-header-wrap">
                  <div className="forgot-step-badge">
                    <KeyRound size={13} />
                    <span>Email Link Verified</span>
                  </div>
                  <h2>Set New Password</h2>
                  <p className="muted">
                    Enter your new password below to reset and regain access to your FinTrack account.
                  </p>
                </div>

                <form onSubmit={handleResetWithToken}>
                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <LockKeyhole size={16} /> New Password
                      </span>
                    </div>
                    <div className="password">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Enter at least 6 characters"
                        minLength="6"
                        required
                      />
                      <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}>
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>

                  <label>
                    <div className="label-header-row">
                      <span className="label-left-text">
                        <LockKeyhole size={16} /> Confirm New Password
                      </span>
                    </div>
                    <div className="password">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        minLength="6"
                        required
                      />
                    </div>
                  </label>

                  {error && <div className="error">{error}</div>}

                  <button
                    type="submit"
                    className="primary full"
                    disabled={loading}
                  >
                    {loading ? "Updating Password..." : "Set New Password & Login"}
                  </button>
                </form>

                <p className="switch">
                  <button
                    onClick={() => {
                      if (onClearResetToken) onClearResetToken();
                      setMode("login");
                      setError("");
                    }}
                  >
                    ← Back to Login
                  </button>
                </p>
              </>
            )
          ) : (
            <>
              {mode === "signup" ? (
                <h2>Create Account</h2>
              ) : (
                <h2>Welcome Back</h2>
              )}
              <p className="muted">
                {mode === "login" ? "Login to your account" : "Start managing your finances"}
              </p>

              <form onSubmit={submit}>
                {mode === "signup" && (
                  <label>
                    Name
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </label>
                )}

                <label>
                  <div className="label-header-row">
                    <span className="label-left-text">
                      <Mail size={16} /> Email address
                    </span>
                    {mode === "signup" && emailStatus === "unavailable" && (
                      <span className="email-check-badge email-check-unavailable">
                        <X size={11} />
                        <span>{emailMessage}</span>
                      </span>
                    )}
                    {mode === "signup" && emailStatus === "checking" && (
                      <span className="email-check-badge email-check-checking">
                        <RefreshCw size={11} className="spin" />
                        <span>Checking...</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </label>

                <label>
                  <div className="label-header-row">
                    <span className="label-left-text">
                      <LockKeyhole size={16} /> Password
                    </span>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="forgot-link-btn"
                        onClick={() => {
                          setMode("forgot");
                          setForgotStep(1);
                          setForgotEmail(email);
                          setError("");
                          setForgotMessage("");
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="password">
                    <input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      minLength="6"
                      required
                    />
                    <button type="button" onClick={() => setShow(!show)}>
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                {error && <div className="error">{error}</div>}

                <button
                  type="submit"
                  className="primary full"
                  disabled={loading || (mode === "signup" && emailStatus === "unavailable")}
                >
                  {loading
                    ? (mode === "login" ? "Logging in..." : "Sending Link...")
                    : (mode === "login" ? "Login" : "Send Verification Link")}
                </button>
              </form>

              <p className="switch">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError("");
                  }}
                >
                  {mode === "login" ? "Sign up" : "Login"}
                </button>
              </p>
            </>
          )}
        </section>
      </div>

      <footer className="bottom-taskbar">
        <div className="bottom-taskbar-left">
          <span>© {new Date().getFullYear()} FinTrack. All rights reserved.</span>
        </div>
        <div className="bottom-taskbar-right">
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("about")}>About</button>
          <span className="bottom-separator">•</span>
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("contact")}>Contact</button>
          <span className="bottom-separator">•</span>
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("privacy")}>Licence</button>
        </div>
      </footer>

      {modalContent && <InfoModal type={modalContent} onClose={() => setModalContent(null)} />}
    </div>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function NotificationDropdown({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAllNotifications,
  onClose
}) {
  return (
    <div className="notification-dropdown">
      <div className="notification-header">
        <div className="notification-header-title">
          <Bell size={16} color="#10b981" />
          <h4>Notifications</h4>
          {unreadCount > 0 && (
            <span className="notif-unread-pill">{unreadCount} new</span>
          )}
        </div>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <button type="button" className="notif-mark-all-btn" onClick={onMarkAllAsRead} title="Mark all as read">
              <CheckCheck size={14} />
              <span>Mark read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button type="button" className="notif-clear-all-btn" onClick={onClearAllNotifications} title="Clear all notifications from your box">
              <Trash2 size={13} />
              <span>Clear all</span>
            </button>
          )}
        </div>
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="notif-empty-state">
            <div className="notif-empty-icon-wrap">
              <BellRing size={24} />
            </div>
            <h5 className="notif-empty-title">All caught up!</h5>
            <p className="notif-empty-desc">No announcements in your notification inbox.</p>
          </div>
        ) : (
          notifications.map(n => {
            const isIssue = n.type === "issue_update" || Boolean(n.issueStatus) || (n.title && n.title.toLowerCase().includes("issue"));
            const isResolved = n.issueStatus === "resolved" || (n.title && n.title.toLowerCase().includes("resolved"));
            return (
              <div
                key={n._id}
                className={`notification-item ${!n.isRead ? "unread" : ""} ${isResolved ? "notif-item-resolved" : ""}`}
                onClick={() => { if (!n.isRead) onMarkAsRead(n._id); }}
              >
                <div className={`notif-avatar-col ${isResolved ? "resolved-avatar-col" : isIssue ? "issue-avatar-col" : ""}`}>
                  {isResolved ? (
                    <div className="notif-resolved-icon-circle" title="Issue Resolved">
                      <CheckCircle2 size={20} color="#10b981" />
                    </div>
                  ) : isIssue ? (
                    <div className="notif-issue-icon-circle" title="Support Update">
                      <MessageSquare size={18} color="#0284c7" />
                    </div>
                  ) : (
                    <img src={n.sender?.avatar || "/logo-icon.png"} alt="FinTrack" className="notif-avatar-img" />
                  )}
                </div>
                <div className="notif-content-col">
                  <div className="notif-meta-line">
                    <span className="notif-sender-name">
                      {isResolved ? (
                        <>
                          <CheckCircle2 size={12} color="#10b981" />
                          <span>Support Resolution</span>
                        </>
                      ) : isIssue ? (
                        <>
                          <MessageSquare size={12} color="#0284c7" />
                          <span>Support Update</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={12} color="#10b981" />
                          {n.sender?.name || "FinTrack Admin"}
                        </>
                      )}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {n.issueStatus && (
                        <span className={`notif-status-badge status-${n.issueStatus.replace(/\s+/g, "-")}`}>
                          {n.issueStatus.toUpperCase()}
                        </span>
                      )}
                      <span className={`notif-priority-tag notif-priority-${n.priority || "normal"}`}>
                        {n.priority || "normal"}
                      </span>
                    </div>
                  </div>
                  <h5 className="notif-title">{n.title}</h5>
                  <p className="notif-message-text">{n.message}</p>
                  <div className="notif-foot-row">
                    <span className="notif-time">
                      <Clock size={11} />
                      {formatRelativeTime(n.createdAt)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {!n.isRead && (
                        <button
                          type="button"
                          className="notif-read-check-btn"
                          onClick={e => {
                            e.stopPropagation();
                            onMarkAsRead(n._id);
                          }}
                          title="Mark as read"
                        >
                          <Check size={12} />
                          <span>Mark read</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="notif-delete-action-btn"
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteNotification(n._id);
                        }}
                        title="Delete notification"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="notification-footer">
        <Sparkles size={12} color="#10b981" />
        <span>Official Announcements & Issue Updates</span>
      </div>
    </div>
  );
}

function FinanceApp({ user, onLogout, onUpdateUser }) {
  const [page, setPage] = useState("dashboard");
  useEffect(() => { const handler = e => setPage(e.detail); window.addEventListener("fintrack:navigate", handler); return () => window.removeEventListener("fintrack:navigate", handler); }, []);
  const [dashboard, setDashboard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalContent, setModalContent] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const res = await api.get("/notifications");
      if (res.data?.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (e) {
      console.warn("Failed to load notifications:", e.message);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    const handleRefreshNotifs = () => loadNotifications();
    window.addEventListener("fintrack:refreshNotifications", handleRefreshNotifs);
    return () => {
      clearInterval(interval);
      window.removeEventListener("fintrack:refreshNotifications", handleRefreshNotifs);
    };
  }, [refresh]);

  useEffect(() => {
    const handleClickOutside = e => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  const handleMarkNotificationRead = async id => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNotification = async id => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => {
        const item = prev.find(n => n._id === id);
        if (item && !item.isRead) {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return prev.filter(n => n._id !== id);
      });
    } catch (e) {
      console.error("Failed to delete notification:", e);
    }
  };

  const handleClearAllNotifications = async () => {
    if (notifications.length === 0) return;
    try {
      await api.delete("/notifications");
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      console.error("Failed to clear notifications:", e);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [d, t] = await Promise.all([api.get("/dashboard"), api.get("/transactions")]);
      setDashboard(d.data);
      setTransactions(t.data);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      if (err.response?.status === 401) {
        onLogout();
        return;
      }
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [refresh]);

  const isMasterAdmin = user?.email?.toLowerCase() === "fintrack.com@gmail.com";
  const isReadOnlyAdmin = user?.role === "admin-viewer" || user?.isReadOnlyAdmin || user?.email?.toLowerCase()?.includes("sahilnaphade");
  const canViewAdmin = isMasterAdmin || isReadOnlyAdmin || user?.role === "admin";

  const [taskbarSearch, setTaskbarSearch] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    const handleSearchClickOutside = e => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    if (showSearchDropdown) {
      document.addEventListener("mousedown", handleSearchClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleSearchClickOutside);
    };
  }, [showSearchDropdown]);

  const matchingTransactions = useMemo(() => {
    if (!taskbarSearch.trim() || !transactions.length) return [];
    const term = taskbarSearch.trim().toLowerCase();
    return transactions.filter(t => {
      const desc = (t.description || "").toLowerCase();
      const cat = (t.category || "").toLowerCase();
      const amt = String(t.amount || "");
      const type = (t.type || "").toLowerCase();
      const dateStr = t.date ? new Date(t.date).toLocaleDateString("en-IN").toLowerCase() : "";
      return desc.includes(term) || cat.includes(term) || amt.includes(term) || type.includes(term) || dateStr.includes(term);
    });
  }, [taskbarSearch, transactions]);

  const quickNavShortcuts = useMemo(() => {
    const term = taskbarSearch.trim().toLowerCase();
    const allShortcuts = canViewAdmin ? [
      { id: "dashboard", label: "Admin Dashboard", icon: LayoutDashboard, action: () => { setPage("dashboard"); setShowSearchDropdown(false); } },
      { id: "broadcasts", label: "Announcements & Broadcasts", icon: Megaphone, action: () => { setPage("admin-broadcasts"); setShowSearchDropdown(false); } },
      { id: "queries", label: "Contact Inquiries", icon: MessageSquare, action: () => { setPage("admin-queries"); setShowSearchDropdown(false); } },
      { id: "account", label: "Account Settings", icon: UserRound, action: () => { setPage("account"); setShowSearchDropdown(false); } },
    ] : [
      { id: "dashboard", label: "Dashboard Overview", icon: LayoutDashboard, action: () => { setPage("dashboard"); setShowSearchDropdown(false); } },
      { id: "history", label: "Transaction History", icon: History, action: () => { setHistorySearchQuery(taskbarSearch.trim()); setPage("history"); setShowSearchDropdown(false); } },
      { id: "monthly", label: "Monthly Records", icon: CalendarDays, action: () => { setPage("monthly"); setShowSearchDropdown(false); } },
      { id: "account", label: "Account Settings", icon: UserRound, action: () => { setPage("account"); setShowSearchDropdown(false); } },
      { id: "add-tx", label: "Add New Transaction", icon: Plus, action: () => { setShowModal(true); setShowSearchDropdown(false); } },
      { id: "budget", label: "Set Monthly Budget", icon: WalletCards, action: () => { setShowBudgetModal(true); setShowSearchDropdown(false); } },
    ];
    if (!term) return allShortcuts.slice(0, 4);
    return allShortcuts.filter(s => s.label.toLowerCase().includes(term) || s.id.toLowerCase().includes(term));
  }, [taskbarSearch, canViewAdmin]);

  const handleSearchKeyDown = e => {
    if (e.key === "Enter") {
      if (taskbarSearch.trim()) {
        setHistorySearchQuery(taskbarSearch.trim());
        setPage("history");
        setShowSearchDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowSearchDropdown(false);
    }
  };

  const handleViewAllInHistory = () => {
    setHistorySearchQuery(taskbarSearch.trim());
    setPage("history");
    setShowSearchDropdown(false);
  };

  const handleSelectTransaction = t => {
    setEditing(t);
    setShowModal(true);
    setShowSearchDropdown(false);
  };

  const handleClearSearch = () => {
    setTaskbarSearch("");
    if (page === "history") {
      setHistorySearchQuery("");
    }
  };

  const saveTransaction = async form => {
    if (editing) await api.put(`/transactions/${editing._id}`, form);
    else await api.post("/transactions", form);
    setShowModal(false); setEditing(null); setRefresh(x => x + 1);
  };
  const remove = async id => { if (confirm("Delete this transaction?")) { await api.delete(`/transactions/${id}`); setRefresh(x => x + 1); } };

  return (
    <div className="app-shell">
      <header className="app-taskbar main-taskbar">
        <div className="taskbar-left">
          <div
            className="brand-logo-combo clickable-brand"
            onClick={() => {
              setPage("dashboard");
              setShowSearchDropdown(false);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPage("dashboard");
                setShowSearchDropdown(false);
              }
            }}
            title="Go to Dashboard"
          >
            <img src="/logo-icon.png" alt="FinTrack" className="taskbar-logo-img" />
            <div className="taskbar-brand-block">
              <span className="taskbar-brand-title">FinTrack</span>
              <span className="taskbar-brand-slogan">Manage Smarter. Live Smarter.</span>
            </div>
          </div>
        </div>

        <div className="taskbar-center" ref={searchRef}>
          <div className="search">
            <Search size={16} />
            <input
              value={taskbarSearch}
              onChange={e => {
                const val = e.target.value;
                setTaskbarSearch(val);
                setShowSearchDropdown(true);
                if (page === "history") {
                  setHistorySearchQuery(val);
                }
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search transactions, records..."
            />
            {taskbarSearch && (
              <button
                type="button"
                className="taskbar-search-clear-btn"
                onClick={handleClearSearch}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {showSearchDropdown && (
            <div className="taskbar-search-dropdown">
              <div className="search-dropdown-header">
                <span className="search-dropdown-label">
                  {taskbarSearch.trim() ? `Search Results for "${taskbarSearch}"` : "Quick Shortcuts & Actions"}
                </span>
                {taskbarSearch.trim() && (
                  <span className="search-dropdown-count">
                    {matchingTransactions.length} result{matchingTransactions.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {quickNavShortcuts.length > 0 && (
                <div className="search-dropdown-section">
                  <div className="search-section-title">Navigation & Tools</div>
                  <div className="search-shortcuts-list">
                    {quickNavShortcuts.map(item => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="search-shortcut-item"
                          onClick={item.action}
                        >
                          <ItemIcon size={14} className="shortcut-icon" />
                          <span>{item.label}</span>
                          <ChevronRight size={12} className="shortcut-arrow" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {taskbarSearch.trim() && (
                <div className="search-dropdown-section">
                  <div className="search-section-title">Matching Transactions</div>
                  {matchingTransactions.length > 0 ? (
                    <div className="search-results-list">
                      {matchingTransactions.slice(0, 5).map(t => (
                        <div
                          key={t._id}
                          className="search-result-item"
                          onClick={() => handleSelectTransaction(t)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className={`search-result-icon ${t.type === "income" ? "income-icon" : "expense-icon"}`}>
                            {t.type === "income" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          </div>
                          <div className="search-result-info">
                            <b className="search-result-name">{t.description}</b>
                            <div className="search-result-meta">
                              <span className="search-result-category">{t.category}</span>
                              <span className="search-meta-dot">•</span>
                              <span className="search-result-date">
                                {new Date(t.date).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric"
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="search-result-amount">
                            <strong className={t.type === "income" ? "income" : "expense"}>
                              {t.type === "income" ? "+" : "-"}{inr(t.amount)}
                            </strong>
                            <span className="search-click-hint">Click to view/edit</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="search-no-results">
                      <Search size={22} color="#94a3b8" />
                      <p>No transactions matching "<strong>{taskbarSearch}</strong>"</p>
                      <small>Try searching by category (Food, Shopping) or description</small>
                    </div>
                  )}
                </div>
              )}

              {taskbarSearch.trim() && matchingTransactions.length > 0 && !canViewAdmin && (
                <div className="search-dropdown-footer">
                  <button
                    type="button"
                    className="search-view-all-btn"
                    onClick={handleViewAllInHistory}
                  >
                    <span>View all {matchingTransactions.length} records in History</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="taskbar-right">
          {!canViewAdmin ? (
            <button className="primary taskbar-add-btn" onClick={() => setShowModal(true)}>
              <Plus size={16} />
              <span>Add Transaction</span>
            </button>
          ) : (
            <div className="admin-status-indicator-pill">
              <span className="live-dot" />
              <span>{isReadOnlyAdmin ? "Admin Viewer Mode" : "MongoDB Connected"}</span>
            </div>
          )}
          <div className="taskbar-bell-container" ref={bellRef}>
            <button
              type="button"
              className={`taskbar-bell-btn ${showNotifications ? "active" : ""}`}
              onClick={() => setShowNotifications(prev => !prev)}
              title="Announcements & Notifications"
              aria-label="View notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="bell-badge-count">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
            {showNotifications && (
              <NotificationDropdown
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={handleMarkNotificationRead}
                onMarkAllAsRead={handleMarkAllNotificationsRead}
                onDeleteNotification={handleDeleteNotification}
                onClearAllNotifications={handleClearAllNotifications}
                onClose={() => setShowNotifications(false)}
              />
            )}
          </div>
          <div className="taskbar-user" onClick={() => setPage("account")} style={{ cursor: "pointer" }} title="View Account">
            <div className="avatar" style={isMasterAdmin ? { background: "#ffffff", border: "2px solid #10b981", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" } : (isReadOnlyAdmin ? { background: "linear-gradient(135deg, #0284c7, #2563eb)", color: "#fff" } : {})}>
              {isMasterAdmin ? (
                <img src={user?.profilePhoto || "/logo-icon.png"} alt="FinTrack Master Admin" className="taskbar-avatar-img" style={{ objectFit: "contain", width: "100%", height: "100%" }} />
              ) : user?.profilePhoto ? (
                <img src={user.profilePhoto} alt={user.name} className="taskbar-avatar-img" />
              ) : (
                user?.name?.[0] || (isReadOnlyAdmin ? "V" : "S")
              )}
            </div>
            <div className="user-details">
              <div className="user-name-line">
                <b>{user?.name || (isMasterAdmin ? "Administrator" : (isReadOnlyAdmin ? "Admin Viewer" : "Student"))}</b>
                {user?.accountType === "premium" && (
                  <span className="premium-badge-mini" title="Premium Account">★ PRO</span>
                )}
              </div>
              <small>{isMasterAdmin ? "Master Administrator" : (isReadOnlyAdmin ? "Admin (Read-Only)" : (user?.email || "Student Account"))}</small>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <nav>
            {(canViewAdmin ? [
              ["dashboard", "Dashboard", LayoutDashboard],
              ["admin-broadcasts", "Broadcast Announcements", Megaphone],
              ["admin-queries", "Admin Inquiries", ShieldCheck],
              ["account", "Account", UserRound]
            ] : [
              ["dashboard", "Dashboard", LayoutDashboard],
              ["history", "History", History],
              ["monthly", "Monthly Records", CalendarDays],
              ["account", "Account", UserRound]
            ]).map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="logout" onClick={onLogout}>
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </aside>

        <main className="main">
          {page === "dashboard" && (
            canViewAdmin ? (
              <AdminDashboard
                user={user}
                onNavigate={setPage}
                isReadOnly={isReadOnlyAdmin}
                onBroadcastSent={() => { loadNotifications(); setRefresh(x => x + 1); }}
              />
            ) : (
              <Dashboard
                data={dashboard}
                transactions={transactions}
                loading={loading}
                error={error}
                onRetry={load}
                onAdd={() => setShowModal(true)}
                onBudget={() => setShowBudgetModal(true)}
              />
            )
          )}
          {page === "admin-broadcasts" && canViewAdmin && (
            <AdminDashboard
              user={user}
              onNavigate={setPage}
              isReadOnly={isReadOnlyAdmin}
              initialTab="broadcasts"
              onBroadcastSent={() => { loadNotifications(); setRefresh(x => x + 1); }}
            />
          )}
          {page === "history" && !canViewAdmin && (
            <HistoryPage
              transactions={transactions}
              onAdd={() => setShowModal(true)}
              onEdit={t => {
                setEditing(t);
                setShowModal(true);
              }}
              onDelete={remove}
              initialSearch={historySearchQuery}
              onSearchChange={val => {
                setHistorySearchQuery(val);
                setTaskbarSearch(val);
              }}
            />
          )}
          {page === "monthly" && !canViewAdmin && <Monthly data={dashboard} />}
          {page === "account" && <Account user={user} onUpdateUser={onUpdateUser} isReadOnlyAdmin={isReadOnlyAdmin} />}
          {page === "admin-queries" && canViewAdmin && (
            <AdminInquiriesPage user={user} isReadOnly={isReadOnlyAdmin} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {(canViewAdmin ? [
          ["dashboard", "Dashboard", LayoutDashboard],
          ["admin-broadcasts", "Broadcast", Megaphone],
          ["admin-queries", "Inquiries", ShieldCheck],
          ["account", "Account", UserRound]
        ] : [
          ["dashboard", "Dashboard", LayoutDashboard],
          ["history", "History", History],
          ["quick-add", "Add", Plus],
          ["monthly", "Monthly", CalendarDays],
          ["account", "Account", UserRound]
        ]).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`mobile-nav-item ${page === id ? "active" : ""} ${id === "quick-add" ? "mobile-nav-add-btn" : ""}`}
            onClick={() => {
              if (id === "quick-add") {
                setShowModal(true);
              } else {
                setPage(id);
              }
            }}
            aria-label={label}
          >
            <div className="mobile-nav-icon-wrap">
              <Icon size={id === "quick-add" ? 22 : 18} />
            </div>
            <span className="mobile-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <footer className="bottom-taskbar main-bottom-taskbar">
        <div className="bottom-taskbar-left">
          <span>© {new Date().getFullYear()} FinTrack. All rights reserved.</span>
        </div>
        <div className="bottom-taskbar-right">
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("about")}>About</button>
          <span className="bottom-separator">•</span>
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("contact")}>Contact</button>
          <span className="bottom-separator">•</span>
          <button type="button" className="bottom-link-btn" onClick={() => setModalContent("privacy")}>Licence</button>
        </div>
      </footer>

      {showModal && <TransactionModal initial={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSave={saveTransaction} />}
      {showBudgetModal && <BudgetModal current={dashboard?.budget} onClose={() => setShowBudgetModal(false)} onSave={async value => { await api.put("/budget", { monthlyBudget: value }); setShowBudgetModal(false); setRefresh(x => x + 1); }} />}
      {modalContent && <InfoModal type={modalContent} user={user} onClose={() => setModalContent(null)} />}
    </div>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Dashboard({ data, transactions = [], loading, error, onRetry, onAdd, onBudget }) {
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  if (loading && !data) return <div className="loading">Loading dashboard...</div>;
  if (error && !data) return (
    <div className="content">
      <div className="empty">
        <p>{error}</p>
        <button className="primary" onClick={onRetry} style={{ margin: "14px auto 0" }}>Retry</button>
      </div>
    </div>
  );
  if (!data) return <div className="loading">Loading dashboard...</div>;

  // Filter transactions to selected month/year
  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
  });

  const monthIncome = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpenses = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const monthBalance = monthIncome - monthExpenses;

  const byCat = {};
  monthTx.filter(t => t.type === "expense").forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const monthCategories = Object.entries(byCat).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);

  const monthRecent = [...monthTx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  const budget = Number(data.budget || 0);
  const spentPct = budget > 0 ? Math.min(100, (monthExpenses / budget) * 100) : 0;
  const categoryColors = ["#20A979", "#F59E0B", "#8B5CF6", "#EF476F", "#3B82F6", "#14B8A6", "#94A3B8"];

  // Build available months from transactions (unique year-month combos)
  const availableMonths = [];
  const seen = new Set();
  // Always include current month
  const curKey = `${now.getFullYear()}-${now.getMonth()}`;
  seen.add(curKey);
  availableMonths.push({ year: now.getFullYear(), month: now.getMonth() });
  transactions.forEach(t => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) { seen.add(key); availableMonths.push({ year: d.getFullYear(), month: d.getMonth() }); }
  });
  availableMonths.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);

  const goToPrev = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  };
  const goToNext = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  };
  const isCurrentMonth = selMonth === now.getMonth() && selYear === now.getFullYear();
  const isFutureMonth = selYear > now.getFullYear() || (selYear === now.getFullYear() && selMonth > now.getMonth());

  return <div className="content">
    <div className="page-heading dash-heading">
      <div>
        <h1>Hello, {data.user?.name}</h1>
        <p>Here's your financial overview</p>
      </div>
      <div className="dash-heading-right">
        <div className="month-nav">
          <button className="month-nav-btn" onClick={goToPrev} aria-label="Previous month">‹</button>
          <div className="month-nav-label">
            <select
              className="month-nav-select"
              value={`${selYear}-${selMonth}`}
              onChange={e => { const [y, m] = e.target.value.split("-"); setSelYear(Number(y)); setSelMonth(Number(m)); }}
            >
              {availableMonths.map(({ year, month }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {MONTH_NAMES[month]} {year}
                </option>
              ))}
            </select>
          </div>
          <button className="month-nav-btn" onClick={goToNext} disabled={isCurrentMonth || isFutureMonth} aria-label="Next month">›</button>
        </div>
        <button className="primary" onClick={onAdd}><Plus size={17} /> Add Transaction</button>
      </div>
    </div>



    <div className="stats">
      <div className="stat budget-stat"><div className="stat-icon budget-icon"><WalletCards /></div><div className="stat-main"><small>Monthly Budget</small><strong>{inr(budget)}</strong><button className="budget-link" onClick={onBudget}>Set or update your budget <span>→</span></button></div><button className="stat-settings" onClick={onBudget} aria-label="Set budget"><Settings size={19} /></button></div>
      <Stat title="Month Income" value={inr(monthIncome)} icon={<ArrowUpRight />} tone="income-card" sub={MONTH_NAMES[selMonth]} />
      <Stat title="Month Expenses" value={inr(monthExpenses)} icon={<ArrowDownRight />} tone="expense-card" sub={MONTH_NAMES[selMonth]} />
    </div>

    <div className="grid-two">
      <Card title="Income vs Expenses" action={<span className="chart-range">Last 6 Months ▾</span>}>
        <div className="chart">
          {(data.months || []).some(m => (m.income || 0) > 0 || (m.expenses || 0) > 0) ? (
            <ResponsiveContainer width="100%" height={245}>
              <LineChart data={data.months}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={v => `₹${v}`} />
                <Tooltip formatter={v => inr(v)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income" stroke="#20A979" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF476F" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart-msg" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 245, color: "#94a3b8" }}>
              <span style={{ fontSize: "22px", letterSpacing: "8px", fontWeight: 700, marginBottom: "6px", color: "#94a3b8" }}>- - - -</span>
              <span style={{ fontSize: "13px" }}>No income or expenses in this period</span>
            </div>
          )}
        </div>
      </Card>
      <Card title={`Expenses by Category — ${MONTH_NAMES[selMonth]}`}>
        <div className="chart">
          {monthCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={245}>
              <PieChart>
                <Pie data={monthCategories} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} label>
                  {monthCategories.map((item, i) => <Cell key={item.name} fill={categoryColors[i % categoryColors.length]} />)}
                </Pie>
                <Tooltip formatter={v => inr(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart-msg">No expenses this month</div>}
        </div>
      </Card>
    </div>

    <div className="grid-two bottom">
      <Card title={`Transactions — ${MONTH_NAMES[selMonth]} ${selYear}`} action={<button className="text-btn" onClick={() => window.dispatchEvent(new CustomEvent("fintrack:navigate", { detail: "history" }))}>View All</button>}>
        {monthRecent.length > 0 ? monthRecent.map(t => <TransactionRow key={t._id} t={t} />) : <Empty />}
      </Card>
      <Card title="Monthly Budget" action={<div className="budget-actions"><button className="icon-btn" onClick={onBudget} aria-label="Budget settings"><Settings size={18} /></button><button className="set-budget-btn" onClick={onBudget}>Set Budget</button></div>}>
        <div className="budget-value">{inr(budget)}</div>
        <div className="budget-edit-text">Edit your monthly budget</div>
        <div className="progress"><span style={{ width: `${spentPct}%` }} /></div>
        <div className="budget-meta">
          <span>Spent<br /><b>{inr(monthExpenses)} <em>({spentPct.toFixed(1)}%)</em></b></span>
          <span>Remaining<br /><b>{inr(Math.max(0, budget - monthExpenses))} <em>({Math.max(0, 100 - spentPct).toFixed(1)}%)</em></b></span>
        </div>
      </Card>
    </div>
  </div>;
}

const Stat = ({ title, value, icon, tone = "", sub = "This month" }) => <div className={`stat ${tone}`}><div className="stat-icon">{icon}</div><div><small>{title}</small><strong>{value}</strong><span className="stat-sub">{sub}</span></div></div>;
const Card = ({ title, action, children }) => <section className="card"><div className="card-head"><h3>{title}</h3>{action}</div>{children}</section>;

function TransactionRow({ t }) {
  return <div className="transaction-row"><div className="transaction-icon">{t.type === "income" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</div><div className="tx-name"><b>{t.description}</b><small>{t.category} · {new Date(t.date).toLocaleDateString("en-IN")}</small></div><strong className={t.type === "income" ? "income" : "expense"}>{t.type === "income" ? "+" : "-"}{inr(t.amount)}</strong></div>;
}

function HistoryPage({ transactions, onAdd, onEdit, onDelete, initialSearch = "", onSearchChange }) {
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [q, setQ] = useState(initialSearch);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    setQ(initialSearch);
  }, [initialSearch]);

  const handleQChange = e => {
    const val = e.target.value;
    setQ(val);
    if (onSearchChange) onSearchChange(val);
  };

  const handleClear = () => {
    setQ("");
    if (onSearchChange) onSearchChange("");
  };

  // Build available months from all transactions
  const availableMonths = [];
  const seen = new Set();
  const curKey = `${now.getFullYear()}-${now.getMonth()}`;
  seen.add(curKey);
  availableMonths.push({ year: now.getFullYear(), month: now.getMonth() });
  transactions.forEach(t => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) { seen.add(key); availableMonths.push({ year: d.getFullYear(), month: d.getMonth() }); }
  });
  availableMonths.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);

  const goToPrev = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  };
  const goToNext = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  };
  const isCurrentMonth = selMonth === now.getMonth() && selYear === now.getFullYear();
  const isFutureMonth = selYear > now.getFullYear() || (selYear === now.getFullYear() && selMonth > now.getMonth());

  // Filter by selected month first
  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
  });

  const monthIncome = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpenses = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const monthBalance = monthIncome - monthExpenses;

  // Then filter by type & search
  const filtered = monthTx.filter(t => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    const term = q.trim().toLowerCase();
    if (!term) return true;
    const desc = (t.description || "").toLowerCase();
    const cat = (t.category || "").toLowerCase();
    const type = (t.type || "").toLowerCase();
    const amt = String(t.amount || "");
    const dateStr = t.date ? new Date(t.date).toLocaleDateString("en-IN").toLowerCase() : "";
    return desc.includes(term) || cat.includes(term) || type.includes(term) || amt.includes(term) || dateStr.includes(term);
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="content">
      <div className="page-heading dash-heading">
        <div>
          <h1>Transaction History</h1>
          <p>View and manage all your transactions</p>
        </div>
        <div className="dash-heading-right">
          <div className="month-nav">
            <button className="month-nav-btn" onClick={goToPrev} aria-label="Previous month">&#8249;</button>
            <div className="month-nav-label">
              <select
                className="month-nav-select"
                value={`${selYear}-${selMonth}`}
                onChange={e => { const [y, m] = e.target.value.split("-"); setSelYear(Number(y)); setSelMonth(Number(m)); }}
              >
                {availableMonths.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>
                    {MONTH_NAMES[month]} {year}
                  </option>
                ))}
              </select>
            </div>
            <button className="month-nav-btn" onClick={goToNext} disabled={isCurrentMonth || isFutureMonth} aria-label="Next month">&#8250;</button>
          </div>
          <button className="primary" onClick={onAdd}><Plus size={17} /> Add Transaction</button>
        </div>
      </div>

      {/* Month summary strip */}
      <div className="history-month-strip">
        <div className="hms-item income">
          <ArrowUpRight size={15} />
          <span>Income</span>
          <strong>{inr(monthIncome)}</strong>
        </div>
        <div className="hms-divider" />
        <div className="hms-item expense">
          <ArrowDownRight size={15} />
          <span>Expenses</span>
          <strong>{inr(monthExpenses)}</strong>
        </div>
        <div className="hms-divider" />
        <div className="hms-item" style={{ color: monthBalance >= 0 ? "#20A979" : "#EF476F" }}>
          <span>Net Balance</span>
          <strong>{monthBalance >= 0 ? "+" : ""}{inr(monthBalance)}</strong>
        </div>
        <div className="hms-divider" />
        <div className="hms-item">
          <span style={{ color: "#64748b" }}>{monthTx.length} transaction{monthTx.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div className="card table-card">
        <div className="table-tools">
          <div className="search inner">
            <Search size={16} />
            <input
              value={q}
              onChange={handleQChange}
              placeholder="Search description, category, amount..."
            />
            {q && (
              <button type="button" className="taskbar-search-clear-btn" onClick={handleClear} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="history-type-pills">
            {["all", "income", "expense"].map(opt => (
              <button
                key={opt}
                className={`type-pill${typeFilter === opt ? " active" : ""}`}
                onClick={() => setTypeFilter(opt)}
              >
                {opt === "all" ? "All" : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t._id}>
                  <td>{new Date(t.date).toLocaleDateString("en-IN")}</td>
                  <td><b>{t.description}</b></td>
                  <td><span className="pill">{t.category}</span></td>
                  <td><span className={`type-badge ${t.type}`}>{t.type}</span></td>
                  <td className={t.type === "income" ? "income" : "expense"}>
                    {t.type === "income" ? "+" : "-"}{inr(t.amount)}
                  </td>
                  <td>
                    <button className="icon-btn" onClick={() => onEdit(t)} title="Edit"><Pencil size={16} /></button>
                    <button className="icon-btn danger" onClick={() => onDelete(t._id)} title="Delete"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sorted.length && <Empty />}
      </div>
    </div>
  );
}

function Monthly({ data }) {
  const months = data?.months || [];
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Monthly Records</h1>
          <p>View your monthly financial summary</p>
        </div>
      </div>
      <Card title="Monthly Overview">
        {months.some(m => (m.income || 0) > 0 || (m.expenses || 0) > 0) ? (
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={v => `₹${v}`} />
              <Tooltip formatter={v => inr(v)} />
              <Legend />
              <Bar dataKey="income" name="Income" radius={[6, 6, 0, 0]} fill="#1f9c76" />
              <Bar dataKey="expenses" name="Expenses" radius={[6, 6, 0, 0]} fill="#ef476f" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-chart-msg" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#94a3b8" }}>
            <span style={{ fontSize: "26px", letterSpacing: "10px", fontWeight: 700, marginBottom: "8px", color: "#94a3b8" }}>- - - -</span>
            <span style={{ fontSize: "14px" }}>No monthly records yet</span>
          </div>
        )}
      </Card>
      <div className="month-grid" style={{ marginTop: "20px" }}>
        {months.map(m => (
          <div className="month-card" key={m.month}>
            <h3>{m.month}</h3>
            <span>Income</span>
            <b className="income">{inr(m.income)}</b>
            <span>Expenses</span>
            <b className="expense">{inr(m.expenses)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetModal({ current, onClose, onSave }) {
  const [value, setValue] = useState(current || 10000);
  return <div className="modal-backdrop"><div className="modal budget-modal"><div className="modal-head"><h2>Set Monthly Budget</h2><button onClick={onClose}><X /></button></div><p className="muted">Choose how much you plan to spend each month.</p><label>Monthly budget (₹)<input type="number" min="0" step="100" value={value} onChange={e => setValue(e.target.value)} autoFocus /></label><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(Number(value))} disabled={Number(value) < 0}>Save Budget</button></div></div></div>;
}

function StatusBadge({ status }) {
  const s = (status || "under review").toLowerCase().trim();
  if (s === "resolved") {
    return (
      <span className="status-badge status-resolved">
        <CheckCircle2 size={13} />
        <span>Resolved</span>
      </span>
    );
  }
  if (s === "in progress") {
    return (
      <span className="status-badge status-in-progress">
        <RefreshCw size={13} className="spin-slow" />
        <span>In Progress</span>
      </span>
    );
  }
  if (s === "closed") {
    return (
      <span className="status-badge status-closed">
        <span>Closed</span>
      </span>
    );
  }
  return (
    <span className="status-badge status-under-review">
      <Clock size={13} />
      <span>Under Review</span>
    </span>
  );
}

function ImageCropperModal({ imageSrc, onCropComplete, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const miniCanvasRef = useRef(null);
  const imgRef = useRef(null);

  const CROP_CIRCLE = 260;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const baseScale = useMemo(() => {
    if (!naturalSize.w || !naturalSize.h) return 1;
    return CROP_CIRCLE / Math.min(naturalSize.w, naturalSize.h);
  }, [naturalSize]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const img = imgRef.current;

    const drawToCanvas = (canvas, size) => {
      if (!canvas) return;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const scaleRatio = size / CROP_CIRCLE;
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.translate(offset.x * scaleRatio, offset.y * scaleRatio);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      const dw = naturalSize.w * baseScale * scaleRatio;
      const dh = naturalSize.h * baseScale * scaleRatio;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };

    drawToCanvas(previewCanvasRef.current, 80);
    drawToCanvas(miniCanvasRef.current, 38);
  }, [zoom, offset, rotation, imgLoaded, naturalSize, baseScale]);

  const handlePointerDown = e => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
  };

  const handlePointerMove = e => {
    if (!isDraggingRef.current) return;
    setOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handlePointerUp = e => {
    isDraggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }
  };

  const handleWheel = e => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom(z => Math.min(3, Math.max(0.7, +(z + delta).toFixed(2))));
  };

  const handleApply = () => {
    if (!imgLoaded || !imgRef.current) return;
    const img = imgRef.current;
    const OUTPUT_SIZE = 400;
    const scaleRatio = OUTPUT_SIZE / CROP_CIRCLE;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.translate(offset.x * scaleRatio, offset.y * scaleRatio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const dw = naturalSize.w * baseScale * scaleRatio;
    const dh = naturalSize.h * baseScale * scaleRatio;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onCropComplete(dataUrl);
  };

  return (
    <div className="crop-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crop-modal-dialog">
        <div className="crop-modal-header">
          <div className="crop-modal-title-wrap">
            <div className="crop-icon-badge">
              <Crop size={18} />
            </div>
            <div>
              <h3>Crop & Adjust Profile Photo</h3>
              <p>Drag image to center, use zoom slider or wheel to fit your face in the circle</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} title="Cancel">
            <X size={18} />
          </button>
        </div>

        <div className="crop-modal-body">
          <div className="crop-viewport-column">
            <div
              className="crop-viewport-box"
              ref={viewportRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              title="Click and drag to position image"
            >
              {imgLoaded ? (
                <img
                  src={imageSrc}
                  alt="Crop preview"
                  className="crop-source-image"
                  draggable={false}
                  style={{
                    width: naturalSize.w * baseScale,
                    height: naturalSize.h * baseScale,
                    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: "center center"
                  }}
                />
              ) : (
                <div className="crop-loading-placeholder">Loading image...</div>
              )}

              {/* Crop Mask Overlays */}
              <div className="crop-mask-circle-guide">
                <div className="crop-grid-rule-thirds">
                  <div className="grid-line h h1" />
                  <div className="grid-line h h2" />
                  <div className="grid-line v v1" />
                  <div className="grid-line v v2" />
                </div>
              </div>

              <div className="crop-drag-hint-pill">
                <Move size={12} />
                <span>Drag to reposition</span>
              </div>
            </div>

            {/* Viewport Control Bar */}
            <div className="crop-controls-panel">
              <div className="crop-zoom-row">
                <span className="crop-control-label">Zoom:</span>
                <button
                  type="button"
                  className="crop-mini-btn"
                  onClick={() => setZoom(z => Math.max(0.7, +(z - 0.1).toFixed(2)))}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <input
                  type="range"
                  min="0.7"
                  max="3"
                  step="0.02"
                  value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="crop-zoom-slider"
                />
                <button
                  type="button"
                  className="crop-mini-btn"
                  onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <span className="crop-zoom-val">{Math.round(zoom * 100)}%</span>
              </div>

              <div className="crop-actions-row">
                <button
                  type="button"
                  className="secondary-btn small-btn crop-action-btn"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                >
                  <RotateCw size={13} />
                  <span>Rotate 90°</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn small-btn crop-action-btn"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                    setRotation(0);
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Center / Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Preview Card */}
          <div className="crop-preview-column">
            <div className="crop-preview-card">
              <h4>Live Avatar Preview</h4>
              <p className="crop-preview-sub">How your photo appears across FinTrack</p>

              <div className="crop-preview-samples">
                <div className="crop-preview-item">
                  <div className="crop-circle-canvas-wrap large">
                    <canvas ref={previewCanvasRef} className="crop-canvas-elem" />
                  </div>
                  <small>Profile Page (80px)</small>
                </div>

                <div className="crop-preview-item">
                  <div className="crop-circle-canvas-wrap small">
                    <canvas ref={miniCanvasRef} className="crop-canvas-elem" />
                  </div>
                  <small>Taskbar (38px)</small>
                </div>
              </div>

              <div className="crop-tip-box">
                <Sparkles size={14} color="#059669" />
                <span>Centered, clear faces and good lighting look best on your financial dashboard.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="crop-modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleApply}>
            <Check size={16} />
            <span>Apply & Crop Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Account({ user, onUpdateUser, isReadOnlyAdmin }) {
  const isMasterAdmin = user?.email?.toLowerCase() === "fintrack.com@gmail.com";
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhoto || (isMasterAdmin ? "/logo-icon.png" : ""));
  const [accountType, setAccountType] = useState("normal");
  const [systemRole, setSystemRole] = useState(
    user?.systemRole || (isMasterAdmin ? "Master Administrator" : isReadOnlyAdmin ? "Administrator (Read-Only Viewer)" : "Student")
  );
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);

  const [messages, setMessages] = useState([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setProfilePhoto(user.profilePhoto || (isMasterAdmin ? "/logo-icon.png" : ""));
      setAccountType("normal");
      setSystemRole(user.systemRole || (isMasterAdmin ? "Master Administrator" : isReadOnlyAdmin ? "Administrator (Read-Only Viewer)" : "Student"));
      setIsEditing(false);
    }
  }, [user, isMasterAdmin, isReadOnlyAdmin]);

  const handleCancelEdit = () => {
    setName(user?.name || "");
    setProfilePhoto(user?.profilePhoto || (isMasterAdmin ? "/logo-icon.png" : ""));
    setAccountType("normal");
    setSystemRole(user?.systemRole || (isMasterAdmin ? "Master Administrator" : isReadOnlyAdmin ? "Administrator (Read-Only Viewer)" : "Student"));
    setSaveError("");
    setIsEditing(false);
  };

  const loadMessages = async () => {
    setLoadingMsg(true);
    try {
      const res = await api.get("/contact");
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoadingMsg(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleDeleteMessage = async (msgId) => {
    if (!confirm("Are you sure you want to delete this message record?")) return;
    try {
      await api.delete(`/contact/${msgId}`);
      setMessages(prev => prev.filter(m => m._id !== msgId));
      setToast("Message deleted");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Failed to delete message");
    }
  };

  const handlePhotoUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, WEBP, etc.)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Image size should be less than 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const rawImg = new Image();
      rawImg.onload = () => {
        const maxSide = 1600;
        let w = rawImg.width;
        let h = rawImg.height;
        if (w > maxSide || h > maxSide) {
          if (w > h) {
            h = Math.round((h * maxSide) / w);
            w = maxSide;
          } else {
            w = Math.round((w * maxSide) / h);
            h = maxSide;
          }
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tctx = tempCanvas.getContext("2d");
          tctx.drawImage(rawImg, 0, 0, w, h);
          setImageToCrop(tempCanvas.toDataURL("image/jpeg", 0.95));
        } else {
          setImageToCrop(event.target.result);
        }
        setCropModalOpen(true);
      };
      rawImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = croppedDataUrl => {
    setProfilePhoto(croppedDataUrl);
    setCropModalOpen(false);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropCancel = () => {
    setCropModalOpen(false);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemovePhoto = () => {
    setProfilePhoto("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    if (!name.trim()) {
      setSaveError("Full name is required");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const res = await api.put("/user/profile", {
        name: name.trim(),
        profilePhoto,
        accountType,
        systemRole
      });
      if (onUpdateUser && res.data.user) {
        onUpdateUser(res.data.user);
      }
      setSaveSuccess("Profile updated successfully!");
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(""), 4000);
    } catch (err) {
      console.error("Profile update failed:", err);
      setSaveError(err.response?.data?.message || "Failed to update profile settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Account Settings</h1>
          <p>Manage your personal profile, photo, and account tier</p>
        </div>
      </div>
      <div className="card account-card">
        <form onSubmit={handleSave} className="account-form">
          <div className="account-header-profile">
            <div className="account-avatar-wrapper">
              <div className="big-avatar profile-avatar-box" style={isMasterAdmin ? { background: "#ffffff", border: "3px solid #10b981", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" } : {}}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt={name || "User"} className="profile-avatar-img" style={isMasterAdmin && profilePhoto === "/logo-icon.png" ? { objectFit: "contain", width: "100%", height: "100%" } : {}} />
                ) : (
                  <span>{name?.[0] || user?.name?.[0] || "A"}</span>
                )}
              </div>
              <button
                type="button"
                className="avatar-edit-badge-btn"
                onClick={() => {
                  setIsEditing(true);
                  fileInputRef.current?.click();
                }}
                title="Change profile photo"
              >
                <Camera size={14} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                onChange={handlePhotoUpload}
              />
            </div>

            <div className="account-summary-col">
              <div className="account-name-badge-line">
                <h2>{name || user?.name || "Administrator"}</h2>
                {isMasterAdmin ? (
                  <span className="pill pill-admin-master">
                    🛡️ Administrator
                  </span>
                ) : isReadOnlyAdmin ? (
                  <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>
                    👁️ Admin (Read-Only)
                  </span>
                ) : (
                  <>
                    <span className="pill" style={{ background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" }}>
                      {systemRole === "Employee" ? "💼 Employee" : systemRole === "Business" ? "🏢 Business" : systemRole === "Freelancer" ? "💻 Freelancer" : "🎓 Student"}
                    </span>
                    <span className={`pill ${accountType === "premium" ? "pill-premium-badge" : "pill-normal-badge"}`}>
                      {accountType === "premium" ? "★ Premium Plan" : "Normal Plan"}
                    </span>
                  </>
                )}
              </div>
              <p className="muted">{user?.email}</p>
              <div className="avatar-control-btns">
                <button
                  type="button"
                  className="secondary-btn small-btn"
                  onClick={() => {
                    setIsEditing(true);
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload size={13} />
                  <span>Upload Photo</span>
                </button>
                {profilePhoto && (
                  <button
                    type="button"
                    className="secondary-btn small-btn btn-danger-soft"
                    onClick={() => {
                      setIsEditing(true);
                      handleRemovePhoto();
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Remove Photo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="form-grid account-form-grid">
            <label>
              Full Name
              <div className="verified-field-wrap">
                <input
                  type="text"
                  value={name}
                  onChange={e => isEditing && setName(e.target.value)}
                  placeholder="Enter your full name"
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  className={!isEditing ? "input-readonly-clean" : ""}
                  required
                />
                {isEditing && (
                  <span className="verified-badge-tag" style={{ background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}>
                    <Pencil size={11} />
                    <span>Editing</span>
                  </span>
                )}
              </div>
            </label>
            <label>
              Email Address
              <div className="verified-field-wrap">
                <input value={user?.email || ""} readOnly />
                <span className="verified-badge-tag">
                  <CheckCircle2 size={12} />
                  <span>Verified</span>
                </span>
              </div>
            </label>
            <label>
              Currency
              <input value="INR (₹)" readOnly />
            </label>
            <label>
              System Role
              {isMasterAdmin || isReadOnlyAdmin || user?.role === "admin" ? (
                <div className="verified-field-wrap">
                  <input
                    value={
                      isMasterAdmin
                        ? "Master Administrator"
                        : isReadOnlyAdmin
                          ? "Administrator (Read-Only Viewer)"
                          : "Administrator"
                    }
                    readOnly
                    className="input-readonly-clean"
                  />
                  <span className="verified-badge-tag" style={{ background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}>
                    <ShieldCheck size={12} />
                    <span>Protected</span>
                  </span>
                </div>
              ) : (
                <div className="verified-field-wrap">
                  <select
                    value={systemRole}
                    onChange={e => isEditing && setSystemRole(e.target.value)}
                    disabled={!isEditing}
                    className={`account-role-select ${!isEditing ? "input-readonly-clean" : ""}`}
                    aria-label="System Role"
                  >
                    <option value="Employee">Employee</option>
                    <option value="Student">Student</option>
                    <option value="Business">Business / Self-Employed</option>
                    <option value="Freelancer">Freelancer</option>
                  </select>
                  {isEditing ? (
                    <span className="verified-badge-tag" style={{ background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}>
                      <Pencil size={11} />
                      <span>Select</span>
                    </span>
                  ) : (
                    <span className="verified-badge-tag">
                      <CheckCircle2 size={12} />
                      <span>Active</span>
                    </span>
                  )}
                </div>
              )}
            </label>
          </div>

          <div className="account-type-selection-block">
            <div className="account-type-header-line">
              <label className="section-title-label">Account Type</label>
              <span className="account-type-subtitle">
                Select your plan. Normal plan is selected by default.
              </span>
            </div>

            <div className="account-type-options-grid">
              <div
                className={`account-plan-card ${accountType === "normal" ? "plan-active" : ""}`}
                onClick={() => isEditing && setAccountType("normal")}
              >
                <div className="plan-radio-wrap">
                  <span className={`plan-radio-dot ${accountType === "normal" ? "active-dot" : ""}`} />
                </div>
                <div className="plan-info-wrap">
                  <div className="plan-name-row">
                    <strong>Normal</strong>
                    <span className="plan-tag-default">Default Plan</span>
                  </div>
                  <p>Standard personal expense tracking, budgeting, and dashboard analytics in INR.</p>
                </div>
              </div>

              <div
                className="account-plan-card premium-disabled-blur"
                title="Premium plan is currently unavailable to select"
                aria-disabled="true"
              >
                <div className="plan-lock-overlay">
                  <div className="plan-lock-pill">
                    <LockKeyhole size={13} color="#64748b" />
                    <span>Coming Soon</span>
                  </div>
                </div>

                <div className="plan-blurred-content">
                  <div className="plan-radio-wrap">
                    <span className="plan-radio-dot" style={{ background: "#e2e8f0", borderColor: "#cbd5e1" }} />
                  </div>
                  <div className="plan-info-wrap">
                    <div className="plan-name-row">
                      <strong className="text-premium-title" style={{ color: "#94a3b8" }}>★ Premium</strong>
                      <span className="plan-tag-coming-soon">Unavailable</span>
                    </div>
                    <p>Priority customer service handling, Pro identification badge, and exclusive features.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {saveError && <div className="error account-alert-error">{saveError}</div>}
          {saveSuccess && (
            <div className="account-alert-success">
              <CheckCircle2 size={15} />
              <span>{saveSuccess}</span>
            </div>
          )}

          <div className="account-action-footer">
            {!isEditing ? (
              <button
                type="button"
                className="primary account-submit-btn"
                onClick={() => setIsEditing(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <Pencil size={14} />
                <span>Edit Profile</span>
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 13, fontWeight: 600 }}
                >
                  <X size={14} />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="primary account-submit-btn"
                  disabled={saving}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <Check size={14} />
                  <span>{saving ? "Saving Changes..." : "Save Changes"}</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="card account-messages-card">
        <div className="account-messages-header">
          <div className="account-messages-title-wrap">
            <div className="account-messages-icon">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3>Your Messages to Support Team</h3>
              <p className="account-messages-subtitle">
                Track status and review progress of your inquiries sent to our team
              </p>
            </div>
          </div>
          <div className="account-messages-header-right">
            {toast && <span className="toast-pill">{toast}</span>}
            <span className="pill message-count-pill">{messages.length} Total</span>
            <button
              type="button"
              className="icon-btn refresh-btn"
              onClick={loadMessages}
              title="Refresh messages"
              disabled={loadingMsg}
            >
              <RefreshCw size={15} className={loadingMsg ? "spin" : ""} />
            </button>
          </div>
        </div>

        {loadingMsg && messages.length === 0 ? (
          <div className="empty">Loading your messages...</div>
        ) : messages.length === 0 ? (
          <div className="empty">
            <p>No messages sent yet.</p>
            <small style={{ color: "#94a3b8" }}>
              Click <strong>Contact</strong> in the bottom taskbar to send questions or suggestions directly to our team.
            </small>
          </div>
        ) : (
          <div className="messages-table-wrap">
            <table className="messages-table">
              <thead>
                <tr>
                  <th style={{ width: "115px" }}>Date</th>
                  <th style={{ width: "160px" }}>Subject</th>
                  <th>Message</th>
                  <th style={{ width: "145px" }}>Status</th>
                  <th style={{ width: "60px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m._id} className="message-row">
                    <td className="msg-date-col">
                      <span className="msg-date-badge">
                        {new Date(m.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric"
                        })}
                      </span>
                    </td>
                    <td className="msg-subject-col">
                      <span className="msg-subject-text">{m.subject}</span>
                    </td>
                    <td className="msg-content-col">
                      <div className="msg-body-text">{m.message}</div>
                      {m.adminReply && (
                        <div className="admin-reply-box">
                          <div className="admin-reply-tag">
                            <ShieldCheck size={13} />
                            <span>Support Team Reply ({new Date(m.repliedAt || m.updatedAt).toLocaleDateString("en-IN")}):</span>
                          </div>
                          <p className="admin-reply-text">{m.adminReply}</p>
                        </div>
                      )}
                    </td>
                    <td className="msg-status-col">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="msg-action-col" style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="icon-btn danger delete-msg-btn"
                        title="Delete message"
                        onClick={() => handleDeleteMessage(m._id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cropModalOpen && imageToCrop && (
        <ImageCropperModal
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
          onClose={handleCropCancel}
        />
      )}
    </div>
  );
}

function AdminInquiriesPage({ user, isReadOnly }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState("");

  const loadInquiries = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/contact");
      setInquiries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load admin inquiries:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInquiries();
  }, []);

  const handleUpdateStatus = async (id, newStatus) => {
    if (isReadOnly) {
      alert("Permission restricted: Your account has read-only admin access and cannot update status.");
      return;
    }
    setSavingId(id);
    try {
      await api.patch(`/admin/contact/${id}/status`, { status: newStatus });
      setInquiries(prev => prev.map(item => item._id === id ? { ...item, status: newStatus } : item));
      setToast(`Status updated to "${newStatus}"!`);
      window.dispatchEvent(new CustomEvent("fintrack:refreshNotifications"));
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert(err.response?.data?.message || "Failed to update status");
    } finally {
      setSavingId(null);
    }
  };

  const handleSendReply = async (id) => {
    if (isReadOnly) {
      alert("Permission restricted: Your account has read-only admin access and cannot send replies.");
      return;
    }
    if (!replyText.trim()) return;
    setSavingId(id);
    try {
      const res = await api.post(`/admin/contact/${id}/reply`, { reply: replyText.trim() });
      setInquiries(prev => prev.map(item => item._id === id ? res.data.data : item));
      setReplyingId(null);
      setReplyText("");
      setToast("Reply sent to user!");
      window.dispatchEvent(new CustomEvent("fintrack:refreshNotifications"));
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error("Failed to send reply:", err);
      alert(err.response?.data?.message || "Failed to send reply");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (isReadOnly) {
      alert("Permission restricted: Your account has read-only admin access and cannot delete inquiries.");
      return;
    }
    if (!confirm("Are you sure you want to permanently delete this user inquiry?")) return;
    try {
      await api.delete(`/admin/contact/${id}`);
      setInquiries(prev => prev.filter(item => item._id !== id));
      setToast("Inquiry deleted");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error("Failed to delete inquiry:", err);
      alert("Failed to delete inquiry");
    }
  };

  const filtered = inquiries.filter(item => {
    const s = (item.status || "under review").toLowerCase();
    if (filter === "under review" && s !== "under review" && s !== "unread" && s !== "received" && s !== "unresolved") return false;
    if (filter === "in progress" && s !== "in progress") return false;
    if (filter === "resolved" && s !== "resolved") return false;
    if (filter === "closed" && s !== "closed") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match = (item.name || "").toLowerCase().includes(q) ||
        (item.email || "").toLowerCase().includes(q) ||
        (item.subject || "").toLowerCase().includes(q) ||
        (item.message || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const underReviewCount = inquiries.filter(i => {
    const s = (i.status || "under review").toLowerCase();
    return s === "under review" || s === "unread" || s === "received" || s === "unresolved";
  }).length;

  const inProgressCount = inquiries.filter(i => (i.status || "").toLowerCase() === "in progress").length;
  const resolvedCount = inquiries.filter(i => (i.status || "").toLowerCase() === "resolved").length;

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <div className="admin-badge-headline">
            <ShieldCheck size={22} color="#18a579" />
            <h1>Admin Support Queries</h1>
          </div>
          <p>Admin Workspace: Review user inquiries, assign statuses, and send official replies</p>
        </div>
        <div className="admin-heading-actions">
          {toast && <span className="toast-pill">{toast}</span>}
          <button className="secondary-btn refresh-heading-btn" onClick={loadInquiries} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="admin-readonly-banner">
          <Eye size={18} />
          <div>
            <strong>Read-Only Support Desk:</strong>
            <span> You have permission to view all customer inquiries in read-only mode. Sending replies, changing query statuses, and deleting messages are restricted.</span>
          </div>
        </div>
      )}

      <div className="stats admin-inquiries-stats">
        <div className="stat">
          <div className="stat-icon" style={{ background: "#f0f9ff", color: "#0284c7" }}>
            <MessageSquare size={19} />
          </div>
          <div>
            <small>Total Queries</small>
            <strong>{inquiries.length}</strong>
            <span className="stat-sub">From all users</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon" style={{ background: "#fffbeb", color: "#d97706" }}>
            <Clock size={19} />
          </div>
          <div>
            <small>Under Review</small>
            <strong>{underReviewCount}</strong>
            <span className="stat-sub" style={{ color: "#d97706", fontWeight: 700 }}>Awaiting action</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <RefreshCw size={19} />
          </div>
          <div>
            <small>In Progress</small>
            <strong>{inProgressCount}</strong>
            <span className="stat-sub">Being resolved</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <CheckCircle2 size={19} />
          </div>
          <div>
            <small>Resolved</small>
            <strong>{resolvedCount}</strong>
            <span className="stat-sub" style={{ color: "#059669" }}>Completed</span>
          </div>
        </div>
      </div>

      <div className="card admin-queries-card" style={{ marginTop: 22 }}>
        <div className="admin-queries-tools">
          <div className="search inner" style={{ width: 340 }}>
            <Search size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by user, email, subject, keyword..."
            />
          </div>
          <div className="admin-filter-pills">
            {[
              ["all", `All (${inquiries.length})`],
              ["under review", `Under Review (${underReviewCount})`],
              ["in progress", `In Progress (${inProgressCount})`],
              ["resolved", `Resolved (${resolvedCount})`]
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`filter-pill ${filter === k ? "active" : ""}`}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && inquiries.length === 0 ? (
          <div className="empty">Loading inquiries...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p>No queries found matching the selected filter.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "170px" }}>User & Contact</th>
                  <th style={{ width: "110px" }}>Date</th>
                  <th style={{ width: "150px" }}>Subject</th>
                  <th>User Query & Reply</th>
                  <th style={{ width: "165px" }}>Status Control</th>
                  <th style={{ width: "80px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const rawStatus = (item.status || "under review").toLowerCase();
                  const currentStatus = (rawStatus === "received" || rawStatus === "unread" || rawStatus === "unresolved") ? "under review" : rawStatus;
                  return (
                    <tr key={item._id} className="admin-query-row">
                      <td className="admin-user-cell">
                        <div className="admin-user-info">
                          <div className="admin-avatar">
                            {item.name ? item.name[0].toUpperCase() : "U"}
                          </div>
                          <div className="admin-user-details">
                            <strong>{item.name || "Anonymous"}</strong>
                            <a href={`mailto:${item.email}`} className="admin-user-email">
                              {item.email}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="admin-date-cell">
                        <span className="msg-date-badge">
                          {new Date(item.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>
                      </td>
                      <td className="admin-subject-cell">
                        <span className="pill admin-subject-tag">{item.subject}</span>
                      </td>
                      <td className="admin-message-cell">
                        <div className="admin-msg-content">{item.message}</div>
                        {item.adminReply && (
                          <div className="admin-existing-reply">
                            <div className="admin-reply-label">
                              <ShieldCheck size={13} color="#10b981" />
                              <span>Admin Reply ({new Date(item.repliedAt || item.updatedAt).toLocaleDateString("en-IN")}):</span>
                            </div>
                            <p>{item.adminReply}</p>
                          </div>
                        )}
                        {replyingId === item._id ? (
                          <div className="admin-reply-composer">
                            <textarea
                              rows="2"
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              placeholder="Write a response to this user..."
                              autoFocus
                            />
                            <div className="admin-composer-actions">
                              <button
                                type="button"
                                className="secondary-btn small-btn"
                                onClick={() => { setReplyingId(null); setReplyText(""); }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="primary small-btn"
                                disabled={savingId === item._id || !replyText.trim()}
                                onClick={() => handleSendReply(item._id)}
                              >
                                <Send size={13} />
                                <span>{savingId === item._id ? "Sending..." : "Send Reply"}</span>
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="admin-status-cell">
                        <select
                          className={`admin-status-dropdown admin-status-${currentStatus.replace(/\s+/g, "-")} ${isReadOnly ? "readonly-select" : ""}`}
                          value={currentStatus}
                          onChange={e => handleUpdateStatus(item._id, e.target.value)}
                          disabled={isReadOnly || savingId === item._id}
                          title={isReadOnly ? "Read-only access: Status editing disabled" : "Admin: Change query status"}
                        >
                          <option value="under review">⏳ Under Review</option>
                          <option value="in progress">🔄 In Progress</option>
                          <option value="resolved">✅ Resolved</option>
                          <option value="closed">🔒 Closed</option>
                        </select>
                      </td>
                      <td className="admin-actions-cell" style={{ textAlign: "center" }}>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="icon-btn reply-btn"
                            title={isReadOnly ? "Read-only admin: Replying is disabled" : "Reply to user inquiry"}
                            disabled={isReadOnly}
                            onClick={() => {
                              if (isReadOnly) return;
                              setReplyingId(replyingId === item._id ? null : item._id);
                              setReplyText(item.adminReply || "");
                            }}
                            style={isReadOnly ? { opacity: 0.35, cursor: "not-allowed" } : {}}
                          >
                            <Send size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger delete-btn"
                            title={isReadOnly ? "Read-only admin: Deleting is disabled" : "Delete inquiry"}
                            disabled={isReadOnly}
                            onClick={() => {
                              if (isReadOnly) return;
                              handleDelete(item._id);
                            }}
                            style={isReadOnly ? { opacity: 0.35, cursor: "not-allowed" } : {}}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({ user, onNavigate, isReadOnly, initialTab = "users", onBroadcastSent }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab); // "users" | "transactions" | "queries" | "broadcasts" | "all"
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Broadcasts state
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastPriority, setBroadcastPriority] = useState("normal");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const loadBroadcasts = async () => {
    setLoadingBroadcasts(true);
    try {
      const res = await api.get("/admin/broadcasts");
      if (res.data?.success) {
        setBroadcasts(res.data.broadcasts || []);
      }
    } catch (err) {
      console.error("Failed to load broadcasts:", err);
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  useEffect(() => {
    loadBroadcasts();
  }, []);

  const handleSendBroadcast = async e => {
    e.preventDefault();
    if (isReadOnly) {
      alert("Permission restricted: Sahil Naphade account has read-only admin access and cannot broadcast announcements.");
      return;
    }
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      alert("Please provide both a title and a message.");
      return;
    }

    setSendingBroadcast(true);
    try {
      const res = await api.post("/admin/broadcast", {
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        priority: broadcastPriority
      });
      if (res.data?.success) {
        setBroadcastTitle("");
        setBroadcastMessage("");
        setBroadcastPriority("normal");
        setToast("Broadcast announcement delivered to all users!");
        setTimeout(() => setToast(""), 4000);
        await loadBroadcasts();
        if (onBroadcastSent) onBroadcastSent();
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
      alert(err.response?.data?.message || "Failed to broadcast announcement.");
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleDeleteBroadcast = async id => {
    if (isReadOnly) {
      alert("Permission restricted: Only Master Administrator can delete broadcast announcements.");
      return;
    }
    if (!confirm("Are you sure you want to delete this broadcast announcement?")) return;
    try {
      await api.delete(`/admin/broadcast/${id}`);
      setToast("Broadcast announcement removed.");
      setTimeout(() => setToast(""), 3000);
      await loadBroadcasts();
      if (onBroadcastSent) onBroadcastSent();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to delete announcement.");
    }
  };

  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  const [txQuery, setTxQuery] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState("all");

  const [querySearch, setQuerySearch] = useState("");
  const [queryStatusFilter, setQueryStatusFilter] = useState("all");
  const [savingQueryId, setSavingQueryId] = useState(null);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/dashboard");
      setData(res.data);
      if (isManual) {
        setToast("Dashboard synchronized with MongoDB!");
        setTimeout(() => setToast(""), 3000);
      }
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      setError(err.response?.data?.message || "Failed to load admin data from MongoDB");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateQueryStatus = async (id, newStatus) => {
    if (isReadOnly) {
      alert("Permission restricted: Your account has read-only admin access and cannot update query status.");
      return;
    }
    setSavingQueryId(id);
    try {
      await api.patch(`/admin/contact/${id}/status`, { status: newStatus });
      setData(prev => {
        if (!prev) return prev;
        const updatedQueries = (prev.queries || []).map(q => q._id === id ? { ...q, status: newStatus } : q);
        const underReview = updatedQueries.filter(q => {
          const s = (q.status || "under review").toLowerCase();
          return s === "under review" || s === "unread" || s === "received" || s === "unresolved";
        }).length;
        const inProgress = updatedQueries.filter(q => (q.status || "").toLowerCase() === "in progress").length;
        const resolved = updatedQueries.filter(q => (q.status || "").toLowerCase() === "resolved").length;
        return {
          ...prev,
          queries: updatedQueries,
          stats: {
            ...prev.stats,
            underReviewQueries: underReview,
            inProgressQueries: inProgress,
            resolvedQueries: resolved
          }
        };
      });
      setToast(`Status updated to "${newStatus}"!`);
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert(err.response?.data?.message || "Failed to update query status");
    } finally {
      setSavingQueryId(null);
    }
  };

  const users = data?.users || [];
  const transactions = data?.transactions || [];
  const queries = data?.queries || [];
  const stats = data?.stats || {};

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = userQuery.toLowerCase().trim();
      const matchText = !q ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u._id || "").toLowerCase().includes(q);
      const isMaster = u.email?.toLowerCase() === "fintrack.com@gmail.com" || (u.role === "admin" && !u.email?.toLowerCase()?.includes("sahilnaphade"));
      const isViewer = u.role === "admin-viewer" || u.email?.toLowerCase()?.includes("sahilnaphade");
      if (userRoleFilter === "admin") return isMaster;
      if (userRoleFilter === "viewer") return isViewer;
      if (userRoleFilter === "user") return !isMaster && !isViewer;
      return true;
    });
  }, [users, userQuery, userRoleFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const q = txQuery.toLowerCase().trim();
      const userName = t.user?.name || "";
      const userEmail = t.user?.email || "";
      const matchText = !q ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        userName.toLowerCase().includes(q) ||
        userEmail.toLowerCase().includes(q);
      if (!matchText) return false;

      if (txTypeFilter === "income") return t.type === "income";
      if (txTypeFilter === "expense") return t.type === "expense";
      return true;
    });
  }, [transactions, txQuery, txTypeFilter]);

  const filteredQueries = useMemo(() => {
    return queries.filter(item => {
      const s = (item.status || "under review").toLowerCase();
      if (queryStatusFilter === "under review" && s !== "under review" && s !== "unread" && s !== "received" && s !== "unresolved") return false;
      if (queryStatusFilter === "in progress" && s !== "in progress") return false;
      if (queryStatusFilter === "resolved" && s !== "resolved") return false;
      if (queryStatusFilter === "closed" && s !== "closed") return false;

      if (querySearch.trim()) {
        const q = querySearch.toLowerCase();
        const match = (item.name || "").toLowerCase().includes(q) ||
          (item.email || "").toLowerCase().includes(q) ||
          (item.subject || "").toLowerCase().includes(q) ||
          (item.message || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [queries, querySearch, queryStatusFilter]);

  if (loading && !data) {
    return <div className="loading">Loading MongoDB database records...</div>;
  }

  if (error && !data) {
    return (
      <div className="content">
        <div className="empty">
          <p>{error}</p>
          <button className="primary" onClick={() => loadData()} style={{ margin: "14px auto 0" }}>Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <div className="content admin-dash-content">
      <div className="page-heading admin-dash-heading">
        <div>
          <div className="admin-badge-headline">
            <ShieldCheck size={22} color="#18a579" />
            <h1>Admin Executive Dashboard</h1>
          </div>
          <p>MongoDB live records: Registered user accounts & logins, platform transactions, and support queries</p>
        </div>
        <div className="admin-heading-actions">
          {toast && <span className="toast-pill">{toast}</span>}
          <div className="admin-connection-pill">
            <span className="live-dot" />
            <span>MongoDB Connected</span>
          </div>
          <button
            type="button"
            className="primary-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", cursor: "pointer" }}
            onClick={() => setActiveTab("broadcasts")}
          >
            <Megaphone size={15} />
            <span>Broadcast Message</span>
          </button>
          <button className="secondary-btn refresh-heading-btn" onClick={() => loadData(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="admin-readonly-banner" style={{ marginBottom: 20 }}>
          <Eye size={18} />
          <div>
            <strong>Admin Viewer Mode Active:</strong>
            <span> You have permission to inspect all platform users, transactions, and support queries in real-time. Modifying query statuses and replying are restricted to Master Administrators.</span>
          </div>
        </div>
      )}

      {/* 3 Executive Metric Cards (MongoDB Collections) */}
      <div className="stats admin-dash-kpi-grid">
        <div
          className={`stat admin-kpi-card ${activeTab === "users" ? "active-kpi" : ""}`}
          onClick={() => setActiveTab("users")}
          title="Click to view users and logins"
        >
          <div className="stat-icon" style={{ background: "#eef2ff", color: "#4f46e5" }}>
            <Users size={20} />
          </div>
          <div className="admin-kpi-info">
            <small>Registered Users & Logins</small>
            <strong>{stats.totalUsers || users.length}</strong>
            <span className="stat-sub">MongoDB <code>users</code> collection</span>
          </div>
          <div className="kpi-click-hint">View Users →</div>
        </div>

        <div
          className={`stat admin-kpi-card ${activeTab === "transactions" ? "active-kpi" : ""}`}
          onClick={() => setActiveTab("transactions")}
          title="Click to view platform transactions"
        >
          <div className="stat-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <CreditCard size={20} />
          </div>
          <div className="admin-kpi-info">
            <small>Platform Transactions</small>
            <strong>{stats.totalTransactions || transactions.length}</strong>
            <span className="stat-sub">Volume: {inr(stats.totalVolume || 0)}</span>
          </div>
          <div className="kpi-click-hint">View Transactions →</div>
        </div>

        <div
          className={`stat admin-kpi-card ${activeTab === "queries" ? "active-kpi" : ""}`}
          onClick={() => setActiveTab("queries")}
          title="Click to view support queries"
        >
          <div className="stat-icon" style={{ background: "#fffbeb", color: "#d97706" }}>
            <MessageSquare size={20} />
          </div>
          <div className="admin-kpi-info">
            <small>Support Inquiries / Queries</small>
            <strong>{stats.totalQueries || queries.length}</strong>
            <span className="stat-sub" style={{ color: "#d97706", fontWeight: 700 }}>
              {stats.underReviewQueries || 0} Under Review
            </span>
          </div>
          <div className="kpi-click-hint">View Queries →</div>
        </div>

        <div
          className={`stat admin-kpi-card ${activeTab === "broadcasts" ? "active-kpi" : ""}`}
          onClick={() => setActiveTab("broadcasts")}
          title="Click to view and compose broadcast announcements"
        >
          <div className="stat-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <Megaphone size={20} />
          </div>
          <div className="admin-kpi-info">
            <small>Broadcast Announcements</small>
            <strong>{broadcasts.length}</strong>
            <span className="stat-sub" style={{ color: "#059669", fontWeight: 700 }}>
              Live to All Users
            </span>
          </div>
          <div className="kpi-click-hint">Send / Manage →</div>
        </div>
      </div>

      {/* Dataset Selection Tabs */}
      <div className="admin-dash-tabs-bar">
        <div className="admin-dash-tabs">
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            <Users size={16} />
            <span>Users & Logins</span>
            <span className="tab-counter-badge">{users.length}</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "transactions" ? "active" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            <CreditCard size={16} />
            <span>Platform Transactions</span>
            <span className="tab-counter-badge">{transactions.length}</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "queries" ? "active" : ""}`}
            onClick={() => setActiveTab("queries")}
          >
            <MessageSquare size={16} />
            <span>Support Queries</span>
            <span className="tab-counter-badge">{queries.length}</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "broadcasts" ? "active" : ""}`}
            onClick={() => setActiveTab("broadcasts")}
          >
            <Megaphone size={16} />
            <span>Broadcast Announcements</span>
            {broadcasts.length > 0 && (
              <span className="tab-counter-badge">{broadcasts.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <Layers size={16} />
            <span>All-in-One View</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: USERS DATA FROM MONGODB WITH LOGIN */}
      {(activeTab === "users" || activeTab === "all") && (
        <div className="card admin-dataset-card">
          <div className="admin-dataset-header">
            <div className="dataset-title-box">
              <div className="dataset-icon-wrapper" style={{ background: "#eef2ff", color: "#4f46e5" }}>
                <Users size={18} />
              </div>
              <div>
                <h3>Registered Users & Login Accounts</h3>
                <p className="dataset-subtitle">MongoDB <code>users</code> collection with login emails, roles, and dates</p>
              </div>
            </div>
            <div className="dataset-header-badge">
              <span>{filteredUsers.length} of {users.length} Users</span>
            </div>
          </div>

          <div className="admin-queries-tools">
            <div className="search inner" style={{ width: 340 }}>
              <Search size={16} />
              <input
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
                placeholder="Search by name, login email, or ID..."
              />
            </div>
            <div className="admin-filter-pills">
              {[
                ["all", `All (${users.length})`],
                ["admin", `Master Admin (${users.filter(u => u.email?.toLowerCase() === "fintrack.com@gmail.com" || (u.role === "admin" && !u.email?.toLowerCase()?.includes("sahilnaphade"))).length})`],
                ["viewer", `Admin Viewers (${users.filter(u => u.role === "admin-viewer" || u.email?.toLowerCase()?.includes("sahilnaphade")).length})`],
                ["user", `Standard Users (${users.filter(u => u.role !== "admin" && u.role !== "admin-viewer" && u.email?.toLowerCase() !== "fintrack.com@gmail.com" && !u.email?.toLowerCase()?.includes("sahilnaphade")).length})`]
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`filter-pill ${userRoleFilter === k ? "active" : ""}`}
                  onClick={() => setUserRoleFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="empty">
              <p>No user accounts matched your search.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table admin-users-table">
                <thead>
                  <tr>
                    <th style={{ width: "220px" }}>User Name</th>
                    <th style={{ width: "260px" }}>Login Email</th>
                    <th style={{ width: "130px" }}>Account Role</th>
                    <th style={{ width: "170px" }}>Registered Date</th>
                    <th style={{ width: "140px" }}>Monthly Budget</th>
                    <th style={{ width: "180px" }}>MongoDB _id</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const isMaster = u.email?.toLowerCase() === "fintrack.com@gmail.com" || (u.role === "admin" && !u.email?.toLowerCase()?.includes("sahilnaphade"));
                    const isViewer = u.role === "admin-viewer" || u.email?.toLowerCase()?.includes("sahilnaphade");
                    return (
                      <tr key={u._id} className="admin-data-row">
                        <td className="admin-user-cell">
                          <div className="admin-user-info">
                            <div className="admin-avatar" style={isMaster ? { background: "#ffffff", border: "1.5px solid #10b981", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" } : (isViewer ? { background: "linear-gradient(135deg, #0284c7, #2563eb)", color: "#fff" } : {})}>
                              {isMaster ? (
                                <img src={u.profilePhoto || "/logo-icon.png"} alt="FinTrack Master Admin" style={{ width: "85%", height: "85%", objectFit: "contain" }} />
                              ) : u.profilePhoto ? (
                                <img src={u.profilePhoto} alt={u.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                              ) : (
                                u.name ? u.name[0].toUpperCase() : "U"
                              )}
                            </div>
                            <div className="admin-user-details">
                              <strong>{u.name || "Anonymous User"}</strong>
                            </div>
                          </div>
                        </td>
                        <td className="admin-email-cell">
                          <div className="login-email-badge">
                            <Mail size={13} />
                            <span>{u.email}</span>
                          </div>
                        </td>
                        <td>
                          {isMaster ? (
                            <span className="admin-role-badge admin-badge-admin">
                              <ShieldCheck size={12} />
                              <span>Master Admin</span>
                            </span>
                          ) : isViewer ? (
                            <span className="admin-role-badge" style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>
                              <Eye size={12} />
                              <span>Admin (Read-Only)</span>
                            </span>
                          ) : (
                            <span className="admin-role-badge admin-badge-user">
                              <UserRound size={12} />
                              <span>{u.systemRole ? `${u.systemRole} User` : "Student User"}</span>
                            </span>
                          )}
                        </td>
                        <td className="admin-date-cell">
                          <span className="msg-date-badge">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            }) : "Initial Seed"}
                          </span>
                        </td>
                        <td>
                          <strong className="user-budget-val">{inr(u.monthlyBudget || 0)}</strong>
                        </td>
                        <td>
                          <code className="admin-mono-code" title={u._id}>{u._id}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: TRANSACTION DATA FROM MONGODB */}
      {(activeTab === "transactions" || activeTab === "all") && (
        <div className="card admin-dataset-card" style={{ marginTop: activeTab === "all" ? 24 : 0 }}>
          <div className="admin-dataset-header">
            <div className="dataset-title-box">
              <div className="dataset-icon-wrapper" style={{ background: "#ecfdf5", color: "#059669" }}>
                <CreditCard size={18} />
              </div>
              <div>
                <h3>Platform Transactions</h3>
                <p className="dataset-subtitle">MongoDB <code>transactions</code> collection across all registered accounts</p>
              </div>
            </div>
            <div className="dataset-header-badge">
              <span>{filteredTransactions.length} of {transactions.length} Transactions</span>
            </div>
          </div>

          <div className="admin-queries-tools">
            <div className="search inner" style={{ width: 340 }}>
              <Search size={16} />
              <input
                value={txQuery}
                onChange={e => setTxQuery(e.target.value)}
                placeholder="Search description, category, user..."
              />
            </div>
            <div className="admin-filter-pills">
              {[
                ["all", `All (${transactions.length})`],
                ["income", `Income (${transactions.filter(t => t.type === "income").length})`],
                ["expense", `Expense (${transactions.filter(t => t.type === "expense").length})`]
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`filter-pill ${txTypeFilter === k ? "active" : ""}`}
                  onClick={() => setTxTypeFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="empty">
              <p>No transactions found matching criteria.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table admin-tx-table">
                <thead>
                  <tr>
                    <th style={{ width: "120px" }}>Date</th>
                    <th style={{ width: "230px" }}>User Account</th>
                    <th>Description</th>
                    <th style={{ width: "130px" }}>Category</th>
                    <th style={{ width: "110px" }}>Type</th>
                    <th style={{ width: "130px", textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(t => (
                    <tr key={t._id} className="admin-data-row">
                      <td className="admin-date-cell">
                        <span className="msg-date-badge">
                          {new Date(t.date || t.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>
                      </td>
                      <td className="admin-tx-user-cell">
                        <div className="admin-user-info">
                          <div className="admin-avatar-sm" style={t.user?.email?.toLowerCase() === "fintrack.com@gmail.com" ? { background: "#ffffff", border: "1px solid #10b981", padding: 1, display: "flex", alignItems: "center", justifyContent: "center" } : {}}>
                            {t.user?.email?.toLowerCase() === "fintrack.com@gmail.com" ? (
                              <img src={t.user?.profilePhoto || "/logo-icon.png"} alt="Admin" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            ) : t.user?.profilePhoto ? (
                              <img src={t.user.profilePhoto} alt={t.user.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                            ) : (
                              t.user?.name ? t.user.name[0].toUpperCase() : "U"
                            )}
                          </div>
                          <div className="admin-user-details">
                            <strong>{t.user?.name || "Anonymous User"}</strong>
                            <small>{t.user?.email || "No email"}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong className="tx-desc-text">{t.description}</strong>
                      </td>
                      <td>
                        <span className="pill">{t.category}</span>
                      </td>
                      <td>
                        <span className={t.type === "income" ? "tx-pill tx-income" : "tx-pill tx-expense"}>
                          {t.type}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong className={t.type === "income" ? "income" : "expense"}>
                          {t.type === "income" ? "+" : "-"}{inr(t.amount)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: QUERY DATA FROM MONGODB */}
      {(activeTab === "queries" || activeTab === "all") && (
        <div className="card admin-dataset-card" style={{ marginTop: activeTab === "all" ? 24 : 0 }}>
          <div className="admin-dataset-header">
            <div className="dataset-title-box">
              <div className="dataset-icon-wrapper" style={{ background: "#fffbeb", color: "#d97706" }}>
                <MessageSquare size={18} />
              </div>
              <div>
                <h3>User Support Queries</h3>
                <p className="dataset-subtitle">MongoDB <code>contactmessages</code> collection with live statuses</p>
              </div>
            </div>
            <div className="dataset-header-actions">
              <span className="dataset-header-badge">
                {filteredQueries.length} of {queries.length} Queries
              </span>
              <button
                type="button"
                className="secondary-btn small-btn"
                onClick={() => onNavigate("admin-queries")}
              >
                <span>Full Inquiry Desk →</span>
              </button>
            </div>
          </div>

          <div className="admin-queries-tools">
            <div className="search inner" style={{ width: 340 }}>
              <Search size={16} />
              <input
                value={querySearch}
                onChange={e => setQuerySearch(e.target.value)}
                placeholder="Search user, email, subject, message..."
              />
            </div>
            <div className="admin-filter-pills">
              {[
                ["all", `All (${queries.length})`],
                ["under review", `Under Review (${stats.underReviewQueries || 0})`],
                ["in progress", `In Progress (${stats.inProgressQueries || 0})`],
                ["resolved", `Resolved (${stats.resolvedQueries || 0})`]
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`filter-pill ${queryStatusFilter === k ? "active" : ""}`}
                  onClick={() => setQueryStatusFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredQueries.length === 0 ? (
            <div className="empty">
              <p>No support queries found matching criteria.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table admin-queries-table">
                <thead>
                  <tr>
                    <th style={{ width: "190px" }}>User & Contact</th>
                    <th style={{ width: "110px" }}>Date</th>
                    <th style={{ width: "140px" }}>Subject</th>
                    <th>User Query</th>
                    <th style={{ width: "160px" }}>Current Status</th>
                    <th style={{ width: "160px" }}>Status Control</th>
                    <th style={{ width: "90px", textAlign: "center" }}>Thread</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueries.map(q => {
                    const rawStatus = (q.status || "under review").toLowerCase();
                    const currentStatus = (rawStatus === "received" || rawStatus === "unread" || rawStatus === "unresolved") ? "under review" : rawStatus;
                    return (
                      <tr key={q._id} className="admin-data-row">
                        <td className="admin-user-cell">
                          <div className="admin-user-info">
                            <div className="admin-avatar">
                              {q.name ? q.name[0].toUpperCase() : "U"}
                            </div>
                            <div className="admin-user-details">
                              <strong>{q.name || "Anonymous"}</strong>
                              <a href={`mailto:${q.email}`} className="admin-user-email">{q.email}</a>
                            </div>
                          </div>
                        </td>
                        <td className="admin-date-cell">
                          <span className="msg-date-badge">
                            {new Date(q.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            })}
                          </span>
                        </td>
                        <td>
                          <span className="pill admin-subject-tag">{q.subject}</span>
                        </td>
                        <td className="admin-message-cell">
                          <div className="admin-msg-content">{q.message}</div>
                          {q.adminReply && (
                            <div className="admin-existing-reply-sm">
                              <ShieldCheck size={12} color="#10b981" />
                              <span>Replied: {q.adminReply}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={q.status} />
                        </td>
                        <td>
                          <select
                            className={`admin-status-dropdown admin-status-${currentStatus.replace(/\s+/g, "-")} ${isReadOnly ? "readonly-select" : ""}`}
                            value={currentStatus}
                            onChange={e => handleUpdateQueryStatus(q._id, e.target.value)}
                            disabled={isReadOnly || savingQueryId === q._id}
                            title={isReadOnly ? "Read-only access: Status editing disabled" : "Update query status"}
                          >
                            <option value="under review">⏳ Under Review</option>
                            <option value="in progress">🔄 In Progress</option>
                            <option value="resolved">✅ Resolved</option>
                            <option value="closed">🔒 Closed</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="text-link-btn"
                            onClick={() => onNavigate("admin-queries")}
                            title="Open full thread in Admin Inquiries"
                          >
                            Open →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: GLOBAL BROADCAST ANNOUNCEMENTS */}
      {(activeTab === "broadcasts" || activeTab === "all") && (
        <div className="card admin-dataset-card">
          <div className="admin-dataset-header">
            <div className="dataset-title-box">
              <div className="dataset-icon-wrapper" style={{ background: "#ecfdf5", color: "#059669" }}>
                <Megaphone size={18} />
              </div>
              <div>
                <h3>Global Broadcast Announcements</h3>
                <p className="dataset-subtitle">Send alerts and updates that appear directly in every user's taskbar notification bell</p>
              </div>
            </div>
            <div className="dataset-header-badge" style={{ background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}>
              <Radio size={12} />
              <span>{broadcasts.length} Sent Announcements</span>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {/* COMPOSER */}
            <div className="broadcast-composer-card">
              <div className="broadcast-composer-header">
                <div className="broadcast-header-left">
                  <div className="broadcast-header-icon">
                    <Send size={20} />
                  </div>
                  <div>
                    <h3>Compose Global Announcement</h3>
                    <p>This message will immediately be sent to all users with notification alerts</p>
                  </div>
                </div>
                <div className="broadcast-sender-badge">
                  <img src="/logo-icon.png" alt="FinTrack Logo" className="broadcast-sender-logo" />
                  <span>Sender: FinTrack Master Admin</span>
                </div>
              </div>

              {isReadOnly && (
                <div className="admin-locked-banner" style={{ marginBottom: 16 }}>
                  <ShieldCheck size={18} color="#0284c7" />
                  <div>
                    <strong>Admin Viewer Mode Active (Read-Only)</strong>
                    <p>Sahil Naphade account has read-only administrator access. You can view all announcements and user read statistics, but creating or deleting broadcast announcements requires Master Administrator authorization.</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSendBroadcast}>
                <div className="broadcast-form-grid">
                  <div className="broadcast-field-group">
                    <label>Announcement Title *</label>
                    <input
                      type="text"
                      className="broadcast-input"
                      placeholder="e.g. System Maintenance Notice, Feature Update..."
                      value={broadcastTitle}
                      onChange={e => setBroadcastTitle(e.target.value)}
                      disabled={isReadOnly || sendingBroadcast}
                      required
                    />
                  </div>
                  <div className="broadcast-field-group">
                    <label>Priority Level</label>
                    <select
                      className="broadcast-select"
                      value={broadcastPriority}
                      onChange={e => setBroadcastPriority(e.target.value)}
                      disabled={isReadOnly || sendingBroadcast}
                    >
                      <option value="normal">Normal (Info)</option>
                      <option value="important">Important (Amber)</option>
                      <option value="urgent">Urgent (Red Alert)</option>
                    </select>
                  </div>
                </div>

                <div className="broadcast-field-group">
                  <label>Message Content *</label>
                  <textarea
                    className="broadcast-textarea"
                    placeholder="Write your announcement message here for all platform users..."
                    value={broadcastMessage}
                    onChange={e => setBroadcastMessage(e.target.value)}
                    disabled={isReadOnly || sendingBroadcast}
                    rows={4}
                    maxLength={1000}
                    required
                  />
                </div>

                <div className="broadcast-composer-footer">
                  <span className="broadcast-char-count">{broadcastMessage.length} / 1000 characters</span>
                  <button
                    type="submit"
                    className="broadcast-submit-btn"
                    disabled={isReadOnly || sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                  >
                    {sendingBroadcast ? (
                      <>
                        <RefreshCw size={15} className="spin" />
                        <span>Broadcasting to Users...</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>Send Announcement to All Users</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* SENT BROADCASTS HISTORY */}
            <div className="broadcast-history-card" style={{ marginTop: 24 }}>
              <div className="broadcast-history-header">
                <h4>Broadcast Announcements History</h4>
                <button
                  type="button"
                  className="secondary-btn small-btn"
                  onClick={loadBroadcasts}
                  disabled={loadingBroadcasts}
                >
                  <RefreshCw size={13} className={loadingBroadcasts ? "spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>

              {broadcasts.length === 0 ? (
                <div className="empty" style={{ padding: "36px 20px" }}>
                  <BellRing size={28} style={{ color: "#94a3b8", marginBottom: 8 }} />
                  <p>No broadcast announcements sent yet.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: "160px" }}>Date & Time</th>
                        <th style={{ width: "110px" }}>Priority</th>
                        <th>Announcement</th>
                        <th style={{ width: "160px" }}>Read Stats</th>
                        {!isReadOnly && <th style={{ width: "80px", textAlign: "center" }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {broadcasts.map(b => (
                        <tr key={b._id} className="admin-data-row">
                          <td className="admin-date-cell">
                            <span className="msg-date-badge">
                              {new Date(b.createdAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </td>
                          <td>
                            <span className={`notif-priority-tag notif-priority-${b.priority || "normal"}`}>
                              {b.priority || "normal"}
                            </span>
                          </td>
                          <td>
                            <strong style={{ display: "block", color: "#1e293b", marginBottom: 3 }}>
                              {b.title}
                            </strong>
                            <span style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.4, display: "block", whiteSpace: "pre-line" }}>
                              {b.message}
                            </span>
                          </td>
                          <td>
                            <span className="broadcast-read-stat">
                              {b.readCount || 0} / {b.totalUsers || users.length || 1} read
                            </span>
                          </td>
                          {!isReadOnly && (
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="action-btn delete-btn"
                                onClick={() => handleDeleteBroadcast(b._id)}
                                title="Delete announcement"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ type: initial?.type || "expense", description: initial?.description || "", category: initial?.category || "Food", amount: initial?.amount || "", date: initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10) });
  const update = (k, v) => setForm({ ...form, [k]: v });
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{initial ? "Edit" : "Add"} Transaction</h2><button onClick={onClose}><X /></button></div>
    <label>Type<select value={form.type} onChange={e => update("type", e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></label>
    <label>Description<input value={form.description} onChange={e => update("description", e.target.value)} placeholder="e.g. Restaurant" /></label>
    <label>Category<select value={form.category} onChange={e => update("category", e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Amount (₹)<input type="number" min="1" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="0" /></label>
    <label>Date<input type="date" value={form.date} onChange={e => update("date", e.target.value)} /></label>
    <button className="primary full" onClick={() => onSave({ ...form, amount: Number(form.amount) })}>Save Transaction</button>
  </div></div>;
}

function ContactTeamSection({ user, onClose }) {
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    subject: "General Inquiry",
    message: ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.message.trim()) return;
    setSending(true);
    setError("");
    try {
      await api.post("/contact", formData);
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit contact message:", err);
      setError(err.response?.data?.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="contact-success-state">
        <div className="contact-success-icon">
          <CheckCircle2 size={44} color="#18a579" />
        </div>
        <h3>Message Sent to our Team!</h3>
        <p>
          Thank you for reaching out, <strong>{formData.name || "friend"}</strong>. Your message has been saved in the database, and our team will reply to <strong>{formData.email}</strong> within 24 hours.
        </p>
        <div className="contact-success-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setFormData({ name: user?.name || "", email: user?.email || "", subject: "General Inquiry", message: "" });
              setSubmitted(false);
            }}
          >
            Send Another Message
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="contact-team-wrap">
      <div className="contact-header-info">
        <p>Need assistance, found an issue, or have feedback? Send a message directly to our team:</p>
      </div>

      <form className="contact-form" onSubmit={handleSubmit}>
        <div className="contact-input-row">
          <label>
            Your Name
            <input
              type="text"
              required
              placeholder="e.g. John"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </label>
          <label>
            Email Address
            <input
              type="email"
              required
              placeholder="e.g. John@example.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </label>
        </div>

        <label>
          Subject
          <select
            value={formData.subject}
            onChange={e => setFormData({ ...formData, subject: e.target.value })}
          >
            <option value="General Inquiry">General Inquiry</option>
            <option value="Bug Report">Report a Bug / Issue</option>
            <option value="Feature Request">Request a Feature</option>
            <option value="Account Help">Account & Security Support</option>
            <option value="Feedback">App Feedback</option>
          </select>
        </label>

        <label>
          Message
          <textarea
            rows="3"
            required
            placeholder="How can our team help you?"
            value={formData.message}
            onChange={e => setFormData({ ...formData, message: e.target.value })}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="contact-form-footer">
          <div className="contact-quick-email">
            <Mail size={14} />
            <span>Direct: <a href="mailto:support@fintrack.local">fintrack.com@gmail.com</a></span>
          </div>
          <button type="submit" className="primary contact-send-btn" disabled={sending}>
            <Send size={15} />
            {sending ? "Saving to Database..." : "Send Message"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InfoModal({ type, user, onClose }) {
  if (!type) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal info-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {type === "about" ? "About FinTrack" : type === "contact" ? "Send Message to Team" : "Licence & Terms"}
          </h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {type === "about" && (
          <div className="info-modal-content">
            <div className="info-brand-badge">
              <img src="/logo-icon.png" alt="FinTrack" />
              <div>
                <strong>FinTrack</strong>
                <small>Manage Smarter. Live Smarter.</small>
              </div>
            </div>
            <p>
              FinTrack is a modern personal finance manager designed to help students and young professionals take full control of their money.
            </p>
            <ul>
              <li><strong>Track Expenses & Income:</strong> Easily categorize daily transactions in Indian Rupees (₹).</li>
              <li><strong>Smart Budgeting:</strong> Set monthly targets and monitor savings growth in real time.</li>
              <li><strong>Visual Analytics:</strong> Interactive charts for expense categories and 6-month trends.</li>
            </ul>

            <div className="about-designer-credit">
              <div className="designer-title-line">
                <span className="designer-by-text">Design by</span>
                <strong className="designer-name">sahilprojects676</strong>
              </div>
              <div className="designer-links">
                <a
                  href="https://www.instagram.com/sahilprojects676/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="designer-link-chip"
                >
                  <Instagram size={13} />
                  <span>Instagram</span>
                </a>
                <a
                  href="https://github.com/sahilprojects676"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="designer-link-chip"
                >
                  <Github size={13} />
                  <span>GitHub</span>
                </a>
              </div>
            </div>
          </div>
        )}
        {type === "contact" && (
          <div className="info-modal-content">
            <ContactTeamSection user={user} onClose={onClose} />
          </div>
        )}
        {type === "privacy" && (
          <div className="info-modal-content">
            <p><strong>FinTrack Licence & Terms</strong></p>
            <p>
              © {new Date().getFullYear()} FinTrack Inc. All rights reserved.
            </p>
            <p>
              Licensed for personal and educational financial tracking. All software, algorithms, trademarks, and visual designs are the proprietary property of FinTrack.
            </p>
          </div>
        )}
        {type !== "contact" && (
          <div className="modal-actions">
            <button className="primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

const Empty = () => (
  <div className="empty" style={{ textAlign: "center", padding: "28px 16px" }}>
    <div style={{ fontSize: "20px", letterSpacing: "6px", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>- - - -</div>
    <p style={{ margin: 0, color: "#64748b", fontSize: "13.5px" }}>No records yet.</p>
  </div>
);

createRoot(document.getElementById("root")).render(<App />);
