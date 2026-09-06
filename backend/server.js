import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import dnscb from "node:dns";
import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";

// Set reliable public DNS resolvers
dnscb.setServers(["8.8.8.8", "1.1.1.1"]);

import path from "node:path";

dotenv.config();
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
}
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Root health check endpoint for Render / monitoring
app.get("/", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({
    success: true,
    service: "FinTrack API",
    status: "active",
    database: dbStatus,
    message: dbStatus === "connected"
      ? "FinTrack backend server is live and connected to MongoDB!"
      : "FinTrack backend is active, but MongoDB is not connected. Please ensure MONGO_URI is configured with your MongoDB Atlas connection string in Render environment variables.",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({
    success: true,
    service: "FinTrack API",
    status: "active",
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Route compatibility: automatically forward non-/api requests to /api
app.use((req, res, next) => {
  if (req.path !== "/" && !req.path.startsWith("/api")) {
    req.url = `/api${req.url}`;
  }
  next();
});

// ================= POSTMARK / RESEND / NODEMAILER EMAIL PIPELINE =================
async function sendViaPostmark({ to, subject, html, text }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) return null;
  const from = process.env.POSTMARK_FROM || process.env.EMAIL_USER || "fintrack.com@gmail.com";
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token.trim()
      },
      body: JSON.stringify({
        From: from,
        To: Array.isArray(to) ? to.join(",") : to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        MessageStream: "outbound"
      })
    });
    const data = await res.json();
    if (!res.ok || data.ErrorCode) {
      console.warn("[Email Service Postmark] Notice from Postmark:", data.Message || JSON.stringify(data));
      return null;
    }
    console.log(`[Email Service Postmark] Delivered successfully to ${to} via Postmark: ID=${data.MessageID}`);
    return { sent: true, messageId: data.MessageID };
  } catch (err) {
    console.warn("[Email Service Postmark] Error attempting Postmark delivery:", err.message);
    return null;
  }
}

async function sendViaResend({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const from = process.env.RESEND_FROM || "FinTrack <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("[Email Service Resend] Notice from Resend API:", data.message || JSON.stringify(data));
      return null;
    }
    console.log(`[Email Service Resend] Email delivered successfully to ${to} via Resend: ID=${data.id}`);
    return { sent: true, messageId: data.id };
  } catch (err) {
    console.warn("[Email Service Resend] Error attempting Resend delivery:", err.message);
    return null;
  }
}

let mailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000
  });
  console.log(`[Email Service] Configured Gmail delivery via ${process.env.EMAIL_USER}`);
} else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000
  });
  console.log(`[Email Service] Configured SMTP delivery via ${process.env.SMTP_HOST}`);
} else {
  console.log("[Email Service] Fallback SMTP not configured.");
}

async function dispatchEmail({ to, subject, html, text }) {
  // 1. Try Postmark first
  const postmarkResult = await sendViaPostmark({ to, subject, html, text });
  if (postmarkResult && postmarkResult.sent) return postmarkResult;

  // 2. Try Resend second
  const resendResult = await sendViaResend({ to, subject, html, text });
  if (resendResult && resendResult.sent) return resendResult;

  // 3. Fallback to Nodemailer
  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: `"FinTrack" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html
      });
      return { sent: true, messageId: info.messageId };
    } catch (e) {
      console.warn("[Email Service] SMTP delivery failed:", e.message);
    }
  }

  return { sent: false };
}

async function sendEmailCode(targetEmail, code) {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 24px; background: #f8fafc; border-radius: 8px; max-width: 500px;">
      <h2 style="color: #059669; margin-bottom: 8px;">FinTrack Account Verification</h2>
      <p style="color: #334155; font-size: 15px;">Use the following 6-digit verification code to confirm your email and complete your registration:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #047857; margin: 20px 0; padding: 12px 24px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; display: inline-block;">
        ${code}
      </div>
      <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes. If you did not request this, please disregard this email.</p>
    </div>
  `;
  const text = `FinTrack Account Verification\n\nYour 6-digit verification code is: ${code}\nThis code is valid for 10 minutes.`;

  const result = await dispatchEmail({ to: targetEmail, subject: "FinTrack - Email Verification Code", html, text });
  if (!result.sent) {
    console.log(`[Auth Verification Code for ${targetEmail}]: ${code}`);
  }
  return result;
}

async function sendVerificationLinkEmail(targetEmail, targetName, verifyUrl) {
  const text = `Hello ${targetName},\n\nWelcome to FinTrack! Please click the link below to verify your email and activate your account:\n\n${verifyUrl}\n\nThis link is valid for 24 hours. If you did not request this, please disregard this email.\n\nBest regards,\nFinTrack Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #ecfdf5; padding: 12px; border-radius: 50%; margin-bottom: 12px;">
          <span style="font-size: 28px;">🔐</span>
        </div>
        <h1 style="color: #0f172a; font-size: 22px; margin: 0 0 6px; font-weight: 700;">Confirm your email address</h1>
        <p style="color: #64748b; font-size: 14.5px; margin: 0;">Welcome to FinTrack, ${targetName}!</p>
      </div>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #334155; font-size: 14.5px; line-height: 1.5; margin: 0 0 16px;">
          To verify that this email belongs to you and complete your account creation, please click the button below:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}" target="_blank" style="display: inline-block; background: #059669; color: #ffffff; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2);">
            Verify & Activate Account ↗
          </a>
        </div>
        <p style="color: #64748b; font-size: 12.5px; margin: 0; line-height: 1.4;">
          Button not working? Copy and paste this link into your browser:<br/>
          <a href="${verifyUrl}" style="color: #059669; word-break: break-all; font-size: 12px;">${verifyUrl}</a>
        </p>
      </div>
      
      <p style="color: #94a3b8; font-size: 12.5px; text-align: center; margin: 0;">
        This link is valid for 24 hours. If you did not request this, you can safely ignore this email.
      </p>
    </div>
  `;

  const result = await dispatchEmail({ to: targetEmail, subject: "Confirm your FinTrack account", html, text });
  if (!result.sent) {
    console.log(`\n======================================================`);
    console.log(`[FinTrack Verification Link for ${targetEmail}]`);
    console.log(`Click this link to verify and create account:`);
    console.log(`${verifyUrl}`);
    console.log(`======================================================\n`);
  }
  return result;
}

async function sendPasswordResetEmail(targetEmail, targetName, resetUrl, resetCode) {
  const text = `Hello ${targetName},\n\nWe received a request to reset your password for FinTrack.\n\nYour 6-digit Reset Code is: ${resetCode}\n\nOr click the link below to set a new password:\n${resetUrl}\n\nThis code and link expire in 15 minutes. If you did not request this, please ignore this email.\n\nBest regards,\nFinTrack Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #fff1f2; padding: 14px; border-radius: 50%; margin-bottom: 12px; border: 1px solid #fecdd3;">
          <span style="font-size: 30px;">🔑</span>
        </div>
        <h1 style="color: #0f172a; font-size: 22px; margin: 0 0 6px; font-weight: 700;">Reset Your Password</h1>
        <p style="color: #64748b; font-size: 14px; margin: 0;">FinTrack Account Security</p>
      </div>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 22px; margin-bottom: 24px;">
        <p style="color: #334155; font-size: 14.5px; line-height: 1.5; margin: 0 0 16px;">
          Hello <strong>${targetName || "there"}</strong>,<br/><br/>
          We received a request to reset the password for your FinTrack account (<strong>${targetEmail}</strong>).
        </p>

        <div style="text-align: center; margin: 20px 0;">
          <p style="color: #64748b; font-size: 12px; margin-bottom: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Your 6-Digit Reset Code</p>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ef476f; padding: 12px 22px; background: #ffffff; border: 2px dashed #f43f5e; border-radius: 8px; display: inline-block; font-family: monospace;">
            ${resetCode}
          </div>
        </div>

        <div style="text-align: center; margin: 24px 0 16px;">
          <a href="${resetUrl}" target="_blank" style="display: inline-block; background: #ef476f; color: #ffffff; font-weight: 600; font-size: 15px; padding: 13px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 6px -1px rgba(239, 71, 111, 0.25);">
            Click to Set New Password ↗
          </a>
        </div>

        <p style="color: #64748b; font-size: 12px; margin: 16px 0 0; line-height: 1.4; text-align: center;">
          Button not working? Copy & paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #ef476f; word-break: break-all; font-size: 11.5px;">${resetUrl}</a>
        </p>
      </div>
      
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0; line-height: 1.4;">
        This reset code and link expire in <strong>15 minutes</strong>.<br/>
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
  `;

  const result = await dispatchEmail({ to: targetEmail, subject: "FinTrack - Password Reset Request", html, text });
  if (!result.sent) {
    console.log(`\n======================================================`);
    console.log(`[FinTrack Password Reset for ${targetEmail}]`);
    console.log(`Reset Code: ${resetCode}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log(`======================================================\n`);
  }
  return result;
}

async function sendSupportReplyEmail(targetEmail, userName, subject, replyText, status) {
  const isResolved = status === "resolved";
  const emailSubject = isResolved
    ? `FinTrack Support: Issue Resolved - ${subject || "Inquiry"}`
    : `FinTrack Support: Reply to your inquiry - ${subject || "Inquiry"}`;
  const text = `Hello ${userName || "there"},\n\nThe FinTrack Support Team has responded to your inquiry "${subject || "Inquiry"}":\n\n${replyText}\n\nStatus: ${status.toUpperCase()}\n\nBest regards,\nFinTrack Support Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background: ${isResolved ? "#ecfdf5" : "#eff6ff"}; padding: 12px; border-radius: 50%; margin-bottom: 12px;">
          <span style="font-size: 28px;">${isResolved ? "✅" : "💬"}</span>
        </div>
        <h1 style="color: #0f172a; font-size: 20px; margin: 0 0 6px; font-weight: 700;">
          ${isResolved ? "Your Issue Has Been Resolved" : "New Reply from FinTrack Support"}
        </h1>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Inquiry: "${subject || "Inquiry"}"</p>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px;">Support Team Response</p>
        <p style="color: #1e293b; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${replyText}</p>
      </div>

      <div style="text-align: center; margin-bottom: 16px;">
        <span style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 12.5px; font-weight: 600; background: ${isResolved ? "#d1fae5" : "#e0e7ff"}; color: ${isResolved ? "#065f46" : "#3730a3"};">
          Status: ${status.toUpperCase()}
        </span>
      </div>

      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
        Thank you for using FinTrack. If you have further questions, you can reply directly in the app.
      </p>
    </div>
  `;

  return await dispatchEmail({ to: targetEmail, subject: emailSubject, html, text });
}


// ================= LIVE EMAIL VALIDATION & VERIFICATION =================
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DISPOSABLE_DOMAINS = new Set([
  "test.com", "example.com", "fake.com", "temp.com", "mailinator.com",
  "123.com", "asdf.com", "dummy.com", "random.com", "testmail.com",
  "tempmail.com", "10minutemail.com", "guerrillamail.com", "trashmail.com",
  "yopmail.com", "throwawaymail.com", "sharklasers.com", "dispostable.com",
  "getairmail.com", "burnermail.io", "nada.ltd", "mohmal.com",
  "crazymailing.com", "mytemp.email", "temp-mail.org", "generator.email",
  "disposablemail.com", "fakeinbox.com", "inboxkitten.com"
]);

const WELL_KNOWN_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "live.com", "msn.com", "proton.me", "protonmail.com", "zoho.com",
  "aol.com", "mail.com", "ymail.com"
]);

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  let clean = email.toLowerCase().trim();
  if (clean.includes("entrenceexam")) {
    clean = clean.replace("entrenceexam", "entranceexam");
  }
  return clean;
}

async function validateAndVerifyEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, message: "Email address is required" };
  }
  const clean = normalizeEmail(email);
  
  // 1. Strict RFC Syntax and Character Checks
  if (!EMAIL_REGEX.test(clean) || clean.includes("..") || clean.startsWith(".") || clean.endsWith(".")) {
    return { valid: false, message: "Please enter a valid email address format (e.g. name@gmail.com)" };
  }

  const parts = clean.split("@");
  if (parts.length !== 2 || !parts[1].includes(".")) {
    return { valid: false, message: "Email domain is incomplete" };
  }

  const [username, domain] = parts;

  // 2. Username sanity checks
  if (username.length < 1 || username.length > 64) {
    return { valid: false, message: "Email username must be between 1 and 64 characters" };
  }

  // 3. Block disposable/temporary test domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, message: `"${domain}" is a temporary/disposable email service. Please use a real email address (e.g. Gmail, Yahoo, Outlook).` };
  }

  // Fast path for well-known email providers
  if (WELL_KNOWN_DOMAINS.has(domain)) {
    return {
      valid: true,
      cleanEmail: clean,
      domain
    };
  }

  // 4. Live DNS MX verification for custom domains
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, message: `The email domain "${domain}" does not have active mail servers configured to receive emails.` };
    }
    return {
      valid: true,
      cleanEmail: clean,
      domain,
      mxHost: mxRecords[0].exchange
    };
  } catch (err) {
    // If DNS query fails due to local network/firewall, still allow validly formatted emails
    return {
      valid: true,
      cleanEmail: clean,
      domain
    };
  }
}

// In-memory verification code store with 10-minute expiration
const verificationStore = new Map(); // email -> { code, expiresAt, name, passwordHash }

// In-memory password reset store with 15-minute expiration
const passwordResetStore = new Map(); // email -> { code, token, userId, expiresAt }

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log("MongoDB connected");
      seedAdmin();
    })
    .catch(err => console.error("MongoDB connection error:", err.message));
} else {
  console.warn("⚠️ [WARNING] MONGO_URI is not defined in environment variables! Please configure MONGO_URI in your Render dashboard.");
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  monthlyBudget: { type: Number, default: 10000 },
  role: { type: String, enum: ["user", "admin", "admin-viewer"], default: "user" },
  systemRole: {
    type: String,
    enum: ["Student", "Employee", "Business", "Freelancer", "Master Administrator", "Administrator", "Administrator (Read-Only Viewer)"],
    default: "Student"
  },
  profilePhoto: { type: String, default: "" },
  accountType: { type: String, enum: ["normal", "premium"], default: "normal" }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["income", "expense"], required: true },
  description: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  date: { type: Date, required: true }
}, { timestamps: true });

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  subject: { type: String, default: "General Inquiry", trim: true },
  message: { type: String, required: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["under review", "in review", "in progress", "resolved", "closed", "unresolved", "received", "unread", "read"], default: "under review" },
  adminReply: { type: String, default: "", trim: true },
  repliedAt: { type: Date, default: null }
}, { timestamps: true });

const broadcastMessageSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  sender: {
    name: { type: String, default: "FinTrack Administrator" },
    email: { type: String, default: "fintrack.com@gmail.com" },
    avatar: { type: String, default: "/logo-icon.png" }
  },
  priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  issueId: { type: mongoose.Schema.Types.ObjectId, ref: "ContactMessage", default: null },
  issueStatus: { type: String, default: "" },
  type: { type: String, default: "broadcast" },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);
const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);
const BroadcastMessage = mongoose.model("BroadcastMessage", broadcastMessageSchema);

const auth = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id).select("-password");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const optionalAuth = async (req, _, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(payload.id).select("-password");
    }
  } catch {
  }
  next();
};

const isSahilNaphade = (email) => {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return e === "sahilnaphade345@gmail.com" || e.startsWith("sahilnaphade");
};

// Allows viewing admin datasets (dashboard stats, users directory, transactions log, user queries)
const adminViewerOnly = (req, res, next) => {
  const email = req.user?.email?.toLowerCase();
  const isMasterAdmin = req.user && (req.user.role === "admin" || email === "fintrack.com@gmail.com");
  const isViewerAdmin = req.user && (req.user.role === "admin-viewer" || isSahilNaphade(email));
  if (isMasterAdmin || isViewerAdmin) return next();
  return res.status(403).json({ message: "Access denied. Administrator privileges required." });
};

// Strictly allows only Master Admin; prevents Sahil Naphade from editing status, replying, or deleting
const adminFullOnly = (req, res, next) => {
  const email = req.user?.email?.toLowerCase();
  if (isSahilNaphade(email) || req.user?.role === "admin-viewer") {
    return res.status(403).json({
      message: "Access restricted: Sahil Naphade account has read-only administrator access. Modifying statuses, deleting inquiries, and sending replies are disabled."
    });
  }
  const isMasterAdmin = req.user && (req.user.role === "admin" || email === "fintrack.com@gmail.com");
  if (isMasterAdmin) return next();
  return res.status(403).json({ message: "Access denied. Master Administrator privileges required." });
};

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/auth/check-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ available: false, error: "Email query parameter is required" });

    const check = await validateAndVerifyEmail(email);
    if (!check.valid) {
      return res.json({ available: false, error: check.message });
    }

    const existing = await User.findOne({ email: check.cleanEmail });
    if (existing) {
      return res.json({ available: false, error: "Email is already registered. Please log in." });
    }

    return res.json({
      available: true,
      cleanEmail: check.cleanEmail,
      message: "Email is valid and available for registration"
    });
  } catch (e) {
    res.status(500).json({ available: false, error: e.message });
  }
});

app.post("/api/auth/send-verification-code", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const check = await validateAndVerifyEmail(email);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }
    const cleanEmail = check.cleanEmail;

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ message: "Email is already registered. Please log in instead." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const hash = await bcrypt.hash(password, 12);

    verificationStore.set(cleanEmail, {
      code,
      expiresAt,
      name: name.trim(),
      passwordHash: hash
    });

    const mailResult = await sendEmailCode(cleanEmail, code);

    res.json({
      success: true,
      message: mailResult.sent
        ? `A 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`
        : `A 6-digit verification code has been generated for ${cleanEmail}.`,
      sentViaEmail: mailResult.sent,
      demoCode: mailResult.sent ? null : code,
      email: cleanEmail
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/request-signup-link", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const check = await validateAndVerifyEmail(email);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }
    const cleanEmail = check.cleanEmail;

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ message: "Email is already registered. Please log in." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const token = jwt.sign(
      {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        purpose: "signup_verification"
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    const clientOrigin = req.headers.origin || process.env.CLIENT_URL || "http://localhost:5173";
    const verifyUrl = `${clientOrigin}?verifyEmailToken=${encodeURIComponent(token)}`;

    const mailResult = await sendVerificationLinkEmail(cleanEmail, name.trim(), verifyUrl);

    res.json({
      success: true,
      message: mailResult.sent
        ? `We dispatched a verification link to ${cleanEmail}. Open your email and click the link to activate your account.`
        : `A verification link has been generated for ${cleanEmail}.`,
      sentViaEmail: mailResult.sent,
      verifyUrl: mailResult.sent ? null : verifyUrl,
      demoLink: mailResult.sent ? null : verifyUrl,
      email: cleanEmail
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/verify-signup-link", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Verification token is required" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Verification link is invalid or has expired. Please sign up again." });
    }

    if (payload.purpose !== "signup_verification" || !payload.email || !payload.passwordHash) {
      return res.status(400).json({ message: "Invalid verification token format" });
    }

    const cleanEmail = payload.email.toLowerCase().trim();

    // Check if account was already created (e.g. user clicked link multiple times)
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      const authToken = jwt.sign({ id: existing._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
      return res.json({
        success: true,
        alreadyVerified: true,
        token: authToken,
        user: {
          id: existing._id,
          name: existing.name,
          email: existing.email,
          role: existing.role,
          monthlyBudget: existing.monthlyBudget,
          profilePhoto: existing.profilePhoto || "",
          accountType: existing.accountType || "normal",
          systemRole: existing.systemRole || "Student"
        }
      });
    }

    // Create user in MongoDB only NOW after email verification link was clicked!
    const role = (cleanEmail === "fintrack.com@gmail.com") ? "admin" : "user";
    const user = await User.create({
      name: payload.name || "Student",
      email: cleanEmail,
      password: payload.passwordHash,
      role
    });

    console.log(`[Account Created via Email Link]: ${user.name} (${user.email}) [Role: ${user.role}]`);

    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({
      success: true,
      token: authToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        monthlyBudget: user.monthlyBudget,
        profilePhoto: user.profilePhoto || "",
        accountType: user.accountType || "normal",
        systemRole: user.systemRole || "Student"
      }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const check = await validateAndVerifyEmail(email);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }
    const cleanEmail = check.cleanEmail;

    if (await User.findOne({ email: cleanEmail })) {
      return res.status(409).json({ message: "Email already registered. Please log in." });
    }

    const role = (cleanEmail === "fintrack.com@gmail.com") ? "admin" : "user";
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        monthlyBudget: user.monthlyBudget,
        profilePhoto: user.profilePhoto || "",
        accountType: user.accountType || "normal",
        systemRole: user.systemRole || "Student"
      }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      console.log(`[AUTH LOGIN FAILED]: User not found in MongoDB for "${cleanEmail}"`);
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password || "", user.password);
    if (!isMatch) {
      console.log(`[AUTH LOGIN FAILED]: Password mismatch for "${cleanEmail}"`);
      return res.status(401).json({ message: "Invalid email or password" });
    }
    console.log(`[AUTH LOGIN SUCCESS]: ${user.name} (${user.email}) logged in successfully`);
    const role = (cleanEmail === "fintrack.com@gmail.com")
      ? "admin"
      : (isSahilNaphade(cleanEmail) ? "admin-viewer" : (user.role || "user"));
    if (user.role !== role) {
      user.role = role;
      await user.save();
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const isReadOnly = isSahilNaphade(cleanEmail) || role === "admin-viewer";
    const isMaster = (cleanEmail === "fintrack.com@gmail.com");
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role,
        isReadOnlyAdmin: isReadOnly,
        canViewAdmin: (role === "admin" || cleanEmail === "fintrack.com@gmail.com" || isReadOnly),
        monthlyBudget: user.monthlyBudget,
        profilePhoto: (cleanEmail === "fintrack.com@gmail.com") ? (user.profilePhoto || "/logo-icon.png") : (user.profilePhoto || ""),
        accountType: user.accountType || "normal",
        systemRole: isMaster ? "Master Administrator" : (isReadOnly ? "Administrator (Read-Only Viewer)" : (user.systemRole || "Student"))
      }
    });
  } catch (e) {
    console.error("[AUTH LOGIN ERROR]:", e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ message: "No registered account found with this email address." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const token = jwt.sign(
      { id: user._id, email: cleanEmail, purpose: "reset_password" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    passwordResetStore.set(cleanEmail, {
      code,
      token,
      userId: user._id,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    const clientOrigin = req.headers.origin || process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientOrigin}?resetPasswordToken=${encodeURIComponent(token)}`;

    const mailResult = await sendPasswordResetEmail(cleanEmail, user.name, resetUrl, code);

    res.json({
      success: true,
      message: mailResult.sent
        ? `A 6-digit reset code and link have been sent to ${cleanEmail}. Please check your email inbox.`
        : `A password reset code has been generated for ${cleanEmail}.`,
      sentViaEmail: mailResult.sent,
      email: cleanEmail,
      demoCode: code,
      resetUrl: resetUrl
    });
  } catch (e) {
    console.error("[AUTH FORGOT-PASSWORD ERROR]:", e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, code, token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    let targetUserId = null;
    let targetEmail = null;

    if (token) {
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return res.status(400).json({ message: "Password reset link is invalid or has expired. Please request a new one." });
      }
      if (payload.purpose !== "reset_password" || !payload.id) {
        return res.status(400).json({ message: "Invalid reset token." });
      }
      targetUserId = payload.id;
      targetEmail = payload.email;
    } else if (email && code) {
      const cleanEmail = normalizeEmail(email);
      targetEmail = cleanEmail;
      const entry = passwordResetStore.get(cleanEmail);
      if (!entry || entry.code !== code.trim()) {
        return res.status(400).json({ message: "Invalid or incorrect 6-digit reset code. Please check and try again." });
      }
      if (Date.now() > entry.expiresAt) {
        passwordResetStore.delete(cleanEmail);
        return res.status(400).json({ message: "Reset code has expired. Please request a new code." });
      }
      targetUserId = entry.userId;
    } else {
      return res.status(400).json({ message: "Please provide either the 6-digit code or reset token." });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User account not found." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    if (targetEmail) {
      passwordResetStore.delete(targetEmail);
    }

    console.log(`[PASSWORD RESET SUCCESS]: User ${user.email} updated password successfully`);

    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const isReadOnly = isSahilNaphade(user.email) || user.role === "admin-viewer";
    const isMaster = (user.email === "fintrack.com@gmail.com");

    res.json({
      success: true,
      message: "Password reset successfully! You can now log in.",
      token: authToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isReadOnlyAdmin: isReadOnly,
        canViewAdmin: (user.role === "admin" || user.email === "fintrack.com@gmail.com" || isReadOnly),
        monthlyBudget: user.monthlyBudget,
        profilePhoto: (user.email === "fintrack.com@gmail.com") ? (user.profilePhoto || "/logo-icon.png") : (user.profilePhoto || ""),
        accountType: user.accountType || "normal",
        systemRole: isMaster ? "Master Administrator" : (isReadOnly ? "Administrator (Read-Only Viewer)" : (user.systemRole || "Student"))
      }
    });
  } catch (e) {
    console.error("[AUTH RESET-PASSWORD ERROR]:", e.message);
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const email = req.user.email?.toLowerCase();
  const isReadOnly = isSahilNaphade(email) || req.user.role === "admin-viewer";
  const isMaster = (email === "fintrack.com@gmail.com") || (req.user.role === "admin" && !isSahilNaphade(email));
  const userObj = req.user.toObject();
  if (email === "fintrack.com@gmail.com") {
    userObj.profilePhoto = "/logo-icon.png";
    userObj.systemRole = "Master Administrator";
  } else if (isMaster) {
    if (!userObj.profilePhoto) userObj.profilePhoto = "/logo-icon.png";
    userObj.systemRole = "Master Administrator";
  } else if (isReadOnly) {
    userObj.systemRole = "Administrator (Read-Only Viewer)";
  } else if (!userObj.systemRole) {
    userObj.systemRole = "Student";
  }
  res.json({
    ...userObj,
    isReadOnlyAdmin: isReadOnly,
    canViewAdmin: isMaster || isReadOnly
  });
});

app.put("/api/user/profile", auth, async (req, res) => {
  try {
    const userEmail = req.user?.email?.toLowerCase();
    if (userEmail === "fintrack.com@gmail.com") {
      return res.status(403).json({
        message: "This administrative account (fintrack.com@gmail.com) is system-protected and cannot be modified."
      });
    }

    const { name, profilePhoto, accountType, systemRole } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    // Premium plan is temporarily unselectable / unavailable
    const validAccountType = "normal";
    const updateFields = {
      name: name.trim(),
      accountType: validAccountType
    };
    if (typeof profilePhoto === "string") {
      updateFields.profilePhoto = profilePhoto;
    }
    const ALLOWED_SYSTEM_ROLES = ["Student", "Employee", "Business", "Freelancer"];
    if (systemRole && ALLOWED_SYSTEM_ROLES.includes(systemRole)) {
      updateFields.systemRole = systemRole;
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select("-password");

    console.log(`[User Profile Updated]: ${updated.name} (${updated.email}) [Role: ${updated.systemRole || "Student"}]`);

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updated._id,
        _id: updated._id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        monthlyBudget: updated.monthlyBudget,
        profilePhoto: updated.profilePhoto || "",
        accountType: updated.accountType || "normal",
        systemRole: updated.systemRole || "Student"
      }
    });
  } catch (e) {
    console.error("Profile update error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/budget", auth, async (req, res) => {
  try {
    const userEmail = req.user?.email?.toLowerCase();
    if (userEmail === "fintrack.com@gmail.com") {
      return res.status(403).json({
        message: "This administrative account (fintrack.com@gmail.com) is system-protected and cannot be modified."
      });
    }

    const monthlyBudget = Number(req.body.monthlyBudget);
    if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
      return res.status(400).json({ message: "Budget must be a valid non-negative number" });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { monthlyBudget },
      { new: true, runValidators: true }
    ).select("-password");
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/transactions", auth, async (req, res) => {
  const tx = await Transaction.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
  res.json(tx);
});

app.post("/api/transactions", auth, async (req, res) => {
  const { type, description, category, amount, date } = req.body;
  const tx = await Transaction.create({ user: req.user._id, type, description, category, amount, date });
  res.status(201).json(tx);
});

app.put("/api/transactions/:id", auth, async (req, res) => {
  const tx = await Transaction.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, req.body, { new: true, runValidators: true });
  if (!tx) return res.status(404).json({ message: "Transaction not found" });
  res.json(tx);
});

app.delete("/api/transactions/:id", auth, async (req, res) => {
  const tx = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!tx) return res.status(404).json({ message: "Transaction not found" });
  res.json({ message: "Deleted" });
});

app.get("/api/dashboard", auth, async (req, res) => {
  const tx = await Transaction.find({ user: req.user._id });
  const income = tx.filter(x => x.type === "income").reduce((s, x) => s + x.amount, 0);
  const expenses = tx.filter(x => x.type === "expense").reduce((s, x) => s + x.amount, 0);
  const byCat = {};
  tx.filter(x => x.type === "expense").forEach(x => byCat[x.category] = (byCat[x.category] || 0) + x.amount);
  const categories = Object.entries(byCat).map(([name, amount]) => ({ name, amount }));
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthTx = tx.filter(x => new Date(x.date) >= d && new Date(x.date) < next);
    months.push({
      month: d.toLocaleString("en-IN", { month: "short" }),
      income: monthTx.filter(x => x.type === "income").reduce((s, x) => s + x.amount, 0),
      expenses: monthTx.filter(x => x.type === "expense").reduce((s, x) => s + x.amount, 0)
    });
  }
  res.json({
    user: { name: req.user.name },
    income, expenses, balance: income - expenses,
    budget: req.user.monthlyBudget,
    categories,
    months,
    recent: tx.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)
  });
});

app.post("/api/contact", optionalAuth, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }
    const newMessage = await ContactMessage.create({
      name: name.trim(),
      email: email.trim(),
      subject: (subject || "General Inquiry").trim(),
      message: message.trim(),
      user: req.user ? req.user._id : null,
      status: "under review"
    });
    console.log(`[Contact] Message received from ${name} (${email}): "${subject}" [Status: under review]`);
    res.status(201).json({
      success: true,
      message: "Message received successfully. Our team will contact you soon.",
      data: newMessage
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/contact", auth, async (req, res) => {
  try {
    const messages = await ContactMessage.find({
      $or: [{ user: req.user._id }, { email: req.user.email }]
    }).sort({ createdAt: -1 });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/contact/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });
    const valid = ["under review", "in review", "in progress", "resolved", "closed", "unresolved", "received", "unread", "read"];
    const normalized = status.toLowerCase().trim();
    if (!valid.includes(normalized)) {
      return res.status(400).json({ message: `Invalid status. Valid values: ${valid.join(", ")}` });
    }

    const msg = await ContactMessage.findOne({
      _id: req.params.id,
      $or: [{ user: req.user._id }, { email: req.user.email }]
    });
    if (!msg) return res.status(404).json({ message: "Message not found" });

    msg.status = normalized;
    await msg.save();
    console.log(`[Contact] Status of ${msg._id} updated to "${normalized}"`);
    res.json({ success: true, message: "Status updated successfully", data: msg });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/contact/:id", auth, async (req, res) => {
  try {
    const msg = await ContactMessage.findOneAndDelete({
      _id: req.params.id,
      $or: [{ user: req.user._id }, { email: req.user.email }]
    });
    if (!msg) return res.status(404).json({ message: "Message not found" });
    res.json({ success: true, message: "Message deleted successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/admin/dashboard", auth, adminViewerOnly, async (req, res) => {
  try {
    const [users, allTx, allQueries] = await Promise.all([
      User.find().select("-password").sort({ createdAt: -1 }),
      Transaction.find().populate("user", "name email profilePhoto").sort({ createdAt: -1, date: -1 }),
      ContactMessage.find().sort({ createdAt: -1 })
    ]);

    const totalUsers = users.length;
    const totalTransactions = allTx.length;
    const totalVolume = allTx.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalIncome = allTx.filter(t => t.type === "income").reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalExpenses = allTx.filter(t => t.type === "expense").reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalQueries = allQueries.length;
    const underReviewQueries = allQueries.filter(q => {
      const s = (q.status || "under review").toLowerCase();
      return s === "under review" || s === "unread" || s === "received" || s === "unresolved";
    }).length;
    const inProgressQueries = allQueries.filter(q => (q.status || "").toLowerCase() === "in progress").length;
    const resolvedQueries = allQueries.filter(q => (q.status || "").toLowerCase() === "resolved").length;

    res.json({
      stats: {
        totalUsers,
        totalTransactions,
        totalVolume,
        totalIncome,
        totalExpenses,
        totalQueries,
        underReviewQueries,
        inProgressQueries,
        resolvedQueries
      },
      users,
      transactions: allTx,
      queries: allQueries,
      recentTransactions: allTx.slice(0, 15),
      recentQueries: allQueries.slice(0, 15)
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/admin/contact", auth, adminViewerOnly, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/admin/contact/:id/status", auth, adminFullOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });
    const valid = ["under review", "in review", "in progress", "resolved", "closed", "unresolved", "received", "unread", "read"];
    const normalized = status.toLowerCase().trim();
    if (!valid.includes(normalized)) {
      return res.status(400).json({ message: `Invalid status. Valid values: ${valid.join(", ")}` });
    }

    const msg = await ContactMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const previousStatus = msg.status;
    msg.status = normalized;
    await msg.save();
    console.log(`[Admin] Status of message ${msg._id} set to "${normalized}"`);

    // Determine target user to notify
    let targetUserId = msg.user;
    if (!targetUserId && msg.email) {
      const u = await User.findOne({ email: msg.email.toLowerCase().trim() });
      if (u) targetUserId = u._id;
    }

    if (targetUserId) {
      const isResolved = normalized === "resolved";
      const notifTitle = isResolved
        ? `Issue Resolved: ${msg.subject || "Support Inquiry"}`
        : `Issue Updated (${normalized.toUpperCase()}): ${msg.subject || "Support Inquiry"}`;

      const notifBody = isResolved
        ? `Great news! Your inquiry regarding "${msg.subject || "Support Inquiry"}" has been marked as RESOLVED by the FinTrack Support Team.${msg.adminReply ? `\nResolution Notes: ${msg.adminReply}` : ""}`
        : `Your inquiry "${msg.subject || "Support Inquiry"}" status was updated from "${previousStatus || "under review"}" to "${normalized.toUpperCase()}".`;

      await BroadcastMessage.create({
        title: notifTitle,
        message: notifBody,
        sender: {
          name: "FinTrack Support Team",
          email: "support@fintrack.com",
          avatar: "/logo-icon.png"
        },
        priority: isResolved ? "important" : "normal",
        recipient: targetUserId,
        issueId: msg._id,
        issueStatus: normalized,
        type: "issue_update",
        readBy: [],
        deletedBy: []
      });
      console.log(`[Notification] Created issue status notification for user ${targetUserId} (${normalized})`);
    }

    if (normalized === "resolved" && msg.email) {
      sendSupportReplyEmail(msg.email, msg.name, msg.subject, msg.adminReply || "Your inquiry has been investigated and marked as resolved by our team.", "resolved").catch(err => {
        console.warn("[Email Service] Could not send resolution email:", err.message);
      });
    }

    res.json({ success: true, message: "Status updated successfully", data: msg });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/admin/contact/:id/reply", auth, adminFullOnly, async (req, res) => {
  try {
    const { reply, status } = req.body;
    if (!reply || !reply.trim()) return res.status(400).json({ message: "Reply text is required" });

    const msg = await ContactMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    msg.adminReply = reply.trim();
    msg.repliedAt = new Date();
    if (status) {
      msg.status = status.toLowerCase().trim();
    } else if (msg.status === "under review" || msg.status === "unread") {
      msg.status = "in progress";
    }
    await msg.save();
    console.log(`[Admin] Replied to message ${msg._id}`);

    // Determine target user to notify
    let targetUserId = msg.user;
    if (!targetUserId && msg.email) {
      const u = await User.findOne({ email: msg.email.toLowerCase().trim() });
      if (u) targetUserId = u._id;
    }

    if (targetUserId) {
      const isResolved = msg.status === "resolved";
      const notifTitle = isResolved
        ? `Issue Resolved: ${msg.subject || "Support Inquiry"}`
        : `Support Reply: ${msg.subject || "Support Inquiry"}`;

      const notifBody = isResolved
        ? `Your issue "${msg.subject || "Support Inquiry"}" has been marked as RESOLVED!\nAdmin Reply: "${reply.trim()}"`
        : `New reply from FinTrack Support on "${msg.subject || "Support Inquiry"}": "${reply.trim()}". Status: ${msg.status.toUpperCase()}`;

      await BroadcastMessage.create({
        title: notifTitle,
        message: notifBody,
        sender: {
          name: "FinTrack Support Team",
          email: "support@fintrack.com",
          avatar: "/logo-icon.png"
        },
        priority: isResolved ? "important" : "normal",
        recipient: targetUserId,
        issueId: msg._id,
        issueStatus: msg.status,
        type: "issue_update",
        readBy: [],
        deletedBy: []
      });
      console.log(`[Notification] Created issue reply notification for user ${targetUserId}`);
    }

    // Send direct email via Resend / Gmail
    if (msg.email) {
      sendSupportReplyEmail(msg.email, msg.name, msg.subject, reply.trim(), msg.status).catch(err => {
        console.warn("[Email Service] Could not send reply email:", err.message);
      });
    }

    res.json({ success: true, message: "Reply sent successfully", data: msg });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/admin/contact/:id", auth, adminFullOnly, async (req, res) => {
  try {
    const msg = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message not found" });
    res.json({ success: true, message: "Message deleted successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --- BROADCAST ANNOUNCEMENTS & NOTIFICATIONS ---

// Admin: Send broadcast announcement to all users (Master Admin only)
app.post("/api/admin/broadcast", auth, adminFullOnly, async (req, res) => {
  try {
    const { title, message, priority } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Announcement title is required." });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Announcement message content is required." });
    }

    const cleanPriority = ["normal", "important", "urgent"].includes((priority || "").toLowerCase())
      ? priority.toLowerCase()
      : "normal";

    const announcement = await BroadcastMessage.create({
      title: title.trim(),
      message: message.trim(),
      sender: {
        name: "FinTrack Administrator",
        email: "fintrack.com@gmail.com",
        avatar: "/logo-icon.png"
      },
      priority: cleanPriority,
      readBy: [req.user._id] // creator has read their own message
    });

    console.log(`[Broadcast] New announcement created by ${req.user.email}: "${announcement.title}"`);
    res.status(201).json({
      success: true,
      message: "Broadcast announcement sent successfully to all users.",
      data: announcement
    });
  } catch (e) {
    console.error("[Broadcast Error]:", e);
    res.status(500).json({ message: e.message });
  }
});

// Admin: List all broadcast announcements with read stats (Master Admin + Admin Viewer)
app.get("/api/admin/broadcasts", auth, adminViewerOnly, async (req, res) => {
  try {
    const totalUsersCount = await User.countDocuments();
    const broadcasts = await BroadcastMessage.find().sort({ createdAt: -1 });

    const enriched = broadcasts.map(b => {
      const obj = b.toObject();
      obj.readCount = (b.readBy || []).length;
      obj.totalUsers = totalUsersCount;
      return obj;
    });

    res.json({ success: true, broadcasts: enriched });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Admin: Delete a broadcast announcement (Master Admin only)
app.delete("/api/admin/broadcast/:id", auth, adminFullOnly, async (req, res) => {
  try {
    const deleted = await BroadcastMessage.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Broadcast announcement not found." });
    res.json({ success: true, message: "Broadcast announcement removed." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// User: Fetch notifications (for all logged-in users)
app.get("/api/notifications", auth, async (req, res) => {
  try {
    const userIdStr = req.user._id.toString();
    const announcements = await BroadcastMessage.find({
      deletedBy: { $ne: req.user._id },
      $or: [
        { recipient: null },
        { recipient: { $exists: false } },
        { recipient: req.user._id }
      ]
    }).sort({ createdAt: -1 }).limit(40);

    let unreadCount = 0;
    const notifications = announcements.map(item => {
      const isRead = (item.readBy || []).some(id => id.toString() === userIdStr);
      if (!isRead) unreadCount++;
      return {
        _id: item._id,
        title: item.title,
        message: item.message,
        sender: item.sender,
        priority: item.priority,
        type: item.type || (item.issueStatus ? "issue_update" : "broadcast"),
        issueId: item.issueId,
        issueStatus: item.issueStatus,
        createdAt: item.createdAt,
        isRead
      };
    });

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// User: Mark single notification as read
app.patch("/api/notifications/:id/read", auth, async (req, res) => {
  try {
    await BroadcastMessage.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user._id }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// User: Mark all notifications as read
app.patch("/api/notifications/read-all", auth, async (req, res) => {
  try {
    await BroadcastMessage.updateMany({
      deletedBy: { $ne: req.user._id },
      $or: [
        { recipient: null },
        { recipient: { $exists: false } },
        { recipient: req.user._id }
      ]
    }, {
      $addToSet: { readBy: req.user._id }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// User: Delete / dismiss single notification from user's notification box
app.delete("/api/notifications/:id", auth, async (req, res) => {
  try {
    await BroadcastMessage.findByIdAndUpdate(req.params.id, {
      $addToSet: { deletedBy: req.user._id, readBy: req.user._id }
    });
    res.json({ success: true, message: "Notification deleted from your inbox." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// User: Clear all notifications from user's notification box
app.delete("/api/notifications", auth, async (req, res) => {
  try {
    await BroadcastMessage.updateMany({
      deletedBy: { $ne: req.user._id },
      $or: [
        { recipient: null },
        { recipient: { $exists: false } },
        { recipient: req.user._id }
      ]
    }, {
      $addToSet: { deletedBy: req.user._id, readBy: req.user._id }
    });
    res.json({ success: true, message: "All notifications cleared from your inbox." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

const seedAdmin = async () => {
  try {
    const adminPassHash = await bcrypt.hash("fintrack@admin123", 12);
    let adminUser = await User.findOne({ email: "fintrack.com@gmail.com" });
    if (!adminUser) {
      await User.create({
        name: "FinTrack Administrator",
        email: "fintrack.com@gmail.com",
        password: adminPassHash,
        role: "admin",
        monthlyBudget: 50000,
        profilePhoto: "/logo-icon.png"
      });
      console.log("[Admin] Initialized master admin user: fintrack.com@gmail.com with logo profile photo");
    } else {
      adminUser.name = "FinTrack Administrator";
      adminUser.role = "admin";
      adminUser.password = adminPassHash;
      adminUser.profilePhoto = "/logo-icon.png";
      await adminUser.save();
      console.log("[Admin] Verified master admin user: fintrack.com@gmail.com with role 'admin' and logo profile photo");
    }

    // Configure sahilnaphade345@gmail.com as admin-viewer (read-only admin)
    const sahilUser = await User.findOne({ email: "sahilnaphade345@gmail.com" });
    if (sahilUser) {
      sahilUser.role = "admin-viewer";
      await sahilUser.save();
      console.log("[Admin] Configured sahilnaphade345@gmail.com with role 'admin-viewer' (read-only admin)");
    }
  } catch (err) {
    console.error("Failed to seed admin:", err.message);
  }
};
// seedAdmin() is called automatically once MongoDB successfully connects

app.listen(process.env.PORT || 5000, () => console.log(`API running on port ${process.env.PORT || 5000}`));
