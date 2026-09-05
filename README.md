# 💰 FinTrack – Personal Finance Dashboard

A full-stack personal finance management application built with React, Express.js, and MongoDB. FinTrack helps users track income, expenses, budgets, and transactions in INR (₹).

> **Slogan:** *Manage Smarter. Live Smarter.*

---

## ✨ Features

- 🔐 **JWT-based Authentication**: Secure Sign Up, Login, and Password Reset with email verification.
- 💾 **MongoDB Persistence**: Real-time cloud/local database storage for all transactions and accounts.
- 📊 **Dynamic Dashboard**: Month-wise financial overview, net savings, and real-time expense ratios.
- 💰 **Dedicated Monthly Budget**: Set monthly budget targets independently from total balance.
- 📈 **Visual Analytics**: Interactive Income vs. Expenses comparison line charts and Category Donut charts.
- 🧾 **Transaction Management**: Add, edit, search, and delete income/expense entries with instant calculations.
- 📅 **Monthly Records**: Historical monthly breakdown cards and top-placed overview charts.
- 👤 **Custom System Roles**: Tailor profiles for Students, Employees, Business Owners, and Freelancers.
- 🔔 **Targeted Issue Notifications**: Instant bell icon alerts with unread badges when user issues are updated or resolved.
- 🔍 **Search & Quick Shortcuts**: Taskbar global search for records, transactions, and direct page navigation.
- 🌐 **SEO & Google Indexing**: Structured JSON-LD schemas (`WebApplication`, `Organization`, `FAQPage`), OpenGraph, Twitter Cards, `robots.txt`, and `sitemap.xml`.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Recharts, Lucide React, Vanilla CSS
- **Backend**: Node.js, Express.js, Mongoose, JWT, Nodemailer, Bcrypt
- **Database**: MongoDB
- **SEO & Indexing**: Open Graph, Twitter Cards, Schema.org JSON-LD, XML Sitemap, Robots.txt

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB running locally on port 27017 or a MongoDB Atlas URI

---

### 2. Backend Setup

```powershell
cd backend
npm install
```

Create a `.env` file in the `backend/` directory (or use default configuration):
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/fintrack
JWT_SECRET=my_fintrack_secret_123456
EMAIL_USER=fintrack.com@gmail.com
EMAIL_PASS=your_gmail_app_password
```

Start the backend server:
```powershell
npm start
# or for development with auto-reload:
npm run dev
```
Backend runs at `http://localhost:5000`.

---

### 3. Frontend Setup

Open a second terminal window:
```powershell
cd frontend
npm install
npm run dev
```

The frontend application will launch at:
```
http://localhost:5173
```

To create an optimized production build:
```powershell
npm run build
```

---

## 🌐 SEO & Search Engine Indexing

FinTrack includes search engine optimizations:

| File | Purpose |
|------|---------|
| `frontend/index.html` | Meta tags, OpenGraph previews, Twitter Cards, and Schema.org structured data |
| `frontend/public/robots.txt` | Directs Googlebot, Bingbot, and other crawlers |
| `frontend/public/sitemap.xml` | Search engine sitemap listing key pages, change frequencies, and images |
| `frontend/public/site.webmanifest` | PWA manifest for mobile devices and Google search card enhancements |

---

## 🛡️ License

This project is licensed under the MIT License.