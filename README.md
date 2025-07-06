# Vibe Mode Writing Tool

A web-based creative writing platform inspired by Ghostwriter's "Vibe Mode." Collaborate with an AI language model in timed, iterative writing sessions to enhance your creativity and storytelling skills.

## Features

- Back-and-forth writing cycles between you and the AI
- Timed writing sessions with configurable durations
- Timer automatically starts when you begin typing
- Visual warnings when time is running low
- Automatic turn-switching when time expires
- AI-powered text continuation with OpenAI integration
- Selectable genre/vibe modes (Hardboiled Detective, Fantasy, Sci-Fi, and more)
- Modern, responsive web UI with Tiptap rich text editor
- Draggable floating timer
- Typewriter/emanation effect for AI responses

## Getting Started

### Prerequisites

- Node.js (version 14.x or higher)
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ghostwriter-web-edition.git
   cd ghostwriter-web-edition
   ```

2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Create a `.env` file in the `/server` directory:
   ```
   OPENAI_API_KEY=your_api_key_here
   PORT=4000
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:4000`

## Usage

### The Writing Cycle

1. Select a genre/vibe and timer duration from the dropdown menus
2. Click the START button to begin the cycle
3. The AI generates an opening paragraph based on the selected genre
4. When the AI finishes writing (indicated by "Your Turn - Start Typing to Begin Timer"), you can start typing
5. The timer displays the full selected time until you begin typing
6. The timer only starts counting down when you begin typing, not before
7. When the timer is active, it gets a blue border as a visual indicator
8. When the timer gets to 5 seconds remaining, it flashes orange as a warning
9. When the timer expires, your turn ends, the timer flashes red, and the editor locks
10. The AI takes your writing and continues the story
11. The timer resets to its original duration for the next turn
12. The cycle repeats, creating a collaborative story between you and the AI

### Tips

- Double-click the timer to restart it manually if needed
- The timer is draggable if you want to reposition it on the screen
- Choose a longer timer duration for more complex writing

## Development

This project consists of:

- A vanilla JavaScript frontend in the `/vanilla` directory
- A Node.js/Express backend in the `/server` directory

### Frontend

The frontend uses:
- Vanilla JavaScript (ES6+)
- Tiptap for the rich text editor
- CSS for styling

### Backend

The backend uses:
- Express.js
- OpenAI Node.js SDK (v5.x)
- CORS for cross-origin requests
- dotenv for environment variables

## License

MIT

## Acknowledgments

- Inspired by Ghostwriter's "Vibe Mode"
- Built with ❤️ for creative writers everywhere
