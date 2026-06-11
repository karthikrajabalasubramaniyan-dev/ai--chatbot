# Aether Chat — Premium AI Chatbot

Aether Chat is a modern, responsive, glassmorphic AI chatbot interface modeled after ChatGPT. It features full conversation history preservation (using localStorage), custom markdown rendering for AI responses (with code highlights and direct copying), and a dark/light mode toggle.

## Project Structure

```text
ai-chatbot/
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── server.js
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        └── components/
            ├── Sidebar.jsx
            ├── ChatArea.jsx
            ├── MessageItem.jsx
            └── TypingIndicator.jsx
```

---

## Installation & Setup

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher is recommended).

### 1. Configure the Backend

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   ```bash
   copy .env.example .env
   ```
4. Open the `.env` file and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```
   *Note: If no API key is specified (or left as default), the server will automatically run in **Mock Mode**, providing high-quality pre-programmed responses so that you can immediately test all UI features and transitions.*

### 2. Configure the Frontend

1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

---

## Running the Application

To run the full-stack application, you need to start both the backend server and the frontend dev server.

### Start the Backend Server
From the `backend/` directory, run:
```bash
npm run dev
```
The backend will start on [http://localhost:5000](http://localhost:5000).

### Start the Frontend Dev Server
From the `frontend/` directory, run:
```bash
npm run dev
```
The frontend will compile and start on [http://localhost:5173](http://localhost:5173) (or another open port shown in the console). Open this URL in your browser to start chatting!

---

## Key Features Implemented

- **Responsive & Modern Design**: Dark/light mode theme using HSL color tokens with glassmorphic cards and pulsing glow indicators.
- **Persistent Chat History**: Previous chats are managed in a collapsible left sidebar, permitting renaming and deleting. Conversations are persisted using browser `localStorage`.
- **Markdown & Code Formatter**: Render lists, tables, bold text, and code blocks inside AI bubbles. Code blocks feature language headers and a single-click copy button.
- **Copy Message Action**: Each AI message features a floating action button to copy the entire message content to the clipboard.
- **Typing Indicator**: Features a fluid bouncing dot animation to simulate live AI thinking.
- **Auto-scroll**: The message thread automatically scrolls to the newest message upon delivery.
- **Suggestion Chips**: When opening a new chat session, user-friendly suggestion cards let you quickly test common prompts.
"# ai--chatbot" 
