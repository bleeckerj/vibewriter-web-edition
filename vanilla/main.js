import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

// Initialize editor variable at the module level
let editor;
let currentContent = ''; // Track content for LLM context
let isUserTurn = false; // Track whose turn it is (LLM or user)
let isTimerActive = false;
let hasUserStartedTyping = false; // Track if user has started typing in the current turn
let conversation = []; // Track conversation for logging
let uiMode = localStorage.getItem('ghostwriter-ui-mode') || 'standard'; // 'standard' or 'tui'

// Genre prompts
const genrePrompts = {
  hardboiled: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of a hard boiled detective novel. For example, something in the style of Raymond Chandler. The protagonist is a street smart, wise-cracking, private investigator. There is a femme fatale character, typically a beautiful woman, who becomes the protagonist's undoing. The genre includes gritty settings, drinking, cigarette smoking, police, various forms of malfeasence, criminals, hard drinking colleagues, jealous women. The settings have the characteristics of the 1950s in urban settings, although 'futuristic' hard boiled contexts are also viable.`,
  
  fantasy: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of high fantasy. Think Tolkien, George R.R. Martin, or Terry Pratchett. Include elements such as magic, mythical creatures, ancient prophecies, or epic quests. Set in a medieval-inspired world with its own unique cultures, races, and geography. Focus on world-building and establishing a sense of wonder and adventure.`,
  
  scifi: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of science fiction. Consider authors like Isaac Asimov, Ursula K. Le Guin, or Neal Stephenson. Include elements such as advanced technology, space exploration, artificial intelligence, or dystopian/utopian societies. Focus on the impact of scientific advancement on humanity and society, exploring philosophical and ethical questions through a technological lens.`,
  
  horror: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of horror fiction. Think Stephen King, H.P. Lovecraft, or Shirley Jackson. Create an atmosphere of dread, unease, or impending doom. Include elements such as the supernatural, psychological terror, or unsettling scenarios that play on common fears. Focus on building tension and creating a sense of the unknown.`,
  
  romance: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of romance fiction. Consider authors like Jane Austen, Nicholas Sparks, or Nora Roberts. Focus on emotional connection, longing, or the first encounter between potential lovers. Establish characters with chemistry, include elements of attraction, and hint at obstacles or complications that might stand in the way of their relationship.`,
  
  western: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text, about 60 words, in the style of a western novel. Think Cormac McCarthy, Louis L'Amour, or Zane Grey. Include elements such as frontier life, cowboys, lawmen, outlaws, or settlers. Set in the American West of the 19th century, with rugged landscapes, small frontier towns, and the conflict between civilization and wilderness. Focus on themes of justice, survival, honor, or redemption.`,
  
  poetry: `Generate a compelling poetic opening for a creative writing exercise. Provide a stanza of about 4-6 lines with evocative imagery, metaphor, and rhythm. The poem should have emotional depth and create a strong sense of atmosphere or feeling. It can be in any poetic style but should be accessible and impactful, serving as inspiration for further creative writing.`,
  
  solarpunk: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a paragraph of text, about 60 words, in the style of a Solarpunk science fiction adventure novel set in a fictional land where there are AI companions who are like benevolent muses for people who are now able to fully actualize their true selves as creators, craftspeople, traders, explorers, adventurers, community builders, farmers, builders of homes, and technologists. Solarpunk is a genre of science fiction that envisions a future where technology and nature coexist harmoniously, often featuring themes of sustainability, community, and social justice. The story should be set in a world where people have access to advanced AI companions that help them achieve their goals and dreams. The writing style should be engaging, imaginative, and optimistic, reflecting the hopeful and positive nature of the Solarpunk genre.`
};

// Simple draggable floating timer
// Initialize floating timer draggability
function initFloatingTimer() {
  const timer = document.getElementById('floating-timer');
  let offsetX, offsetY, isDragging = false;

  timer.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - timer.offsetLeft;
    offsetY = e.clientY - timer.offsetTop;
    timer.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    timer.style.left = (e.clientX - offsetX) + 'px';
    timer.style.top = (e.clientY - offsetY) + 'px';
    timer.style.right = 'auto';
    timer.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    timer.style.cursor = 'move';
  });
}

// Center editor on load and set initial size
function centerEditorOnLoad() {
  const editorContainer = document.getElementById('editor-container');
  const menuBarHeight = document.querySelector('.top-menu-bar').offsetHeight || 0;
  
  // Set initial size to 80% width and 60% height of the window
  const initialWidth = Math.min(window.innerWidth * 0.8, 1200); // Cap at 1200px
  const initialHeight = Math.min(window.innerHeight * 0.6, 800); // Cap at 800px
  
  editorContainer.style.width = `${initialWidth}px`;
  editorContainer.style.height = `${initialHeight}px`;
  
  // Center the editor, taking into account the menu bar
  const left = (window.innerWidth - initialWidth) / 2;
  const top = ((window.innerHeight - menuBarHeight - initialHeight) / 3) + menuBarHeight; // Account for menu bar
  
  editorContainer.style.left = `${left}px`;
  editorContainer.style.top = `${top}px`;
}

// Update the turn indicator text and style
function updateTurnIndicator(isUser) {
  const indicator = document.getElementById('turn-indicator');
  if (isUser) {
    indicator.textContent = "Your Turn - Start Typing to Begin Timer";
    indicator.style.backgroundColor = '#15803d'; // green
    indicator.style.transform = 'translateX(-50%) scale(1.05)'; // Make it slightly larger for user turn
  } else {
    indicator.textContent = "AI's Turn";
    indicator.style.backgroundColor = '#3b82f6'; // blue
    indicator.style.transform = 'translateX(-50%) scale(1)'; // Normal size for AI turn
  }
}

// Initialize the Tiptap editor with event handlers for user input
function initializeEditor() {
  try {
    editor = new Editor({
      element: document.querySelector('#editor'),
      extensions: [
        StarterKit,
      ],
      content: '',
      autofocus: true,
      onUpdate: ({ editor, transaction }) => {
        // Only trigger this on actual user input, not programmatic changes
        if (transaction && transaction.docChanged) {
          currentContent = editor.getHTML();
          
          // If it's the user's turn and they haven't started typing yet and timer isn't active
          if (isUserTurn && !hasUserStartedTyping && !window.timerControls.isActive()) {
            console.log("First keystroke detected, starting timer");
            // Start the timer ONLY on first keystroke
            hasUserStartedTyping = true;
            window.timerControls.start();
            // Update indicator to show timer is running
            const indicator = document.getElementById('turn-indicator');
            indicator.textContent = "Your Turn - Timer Running";
          }
        }
      },
      editable: false // Start with editor disabled until LLM generates content
    });
    
    console.log('Editor initialized successfully');
  } catch (error) {
    console.error('Error initializing editor:', error);
  }
}

// Handle START button click - begins the session
async function handleStartButtonClick() {
  if (!editor) {
    console.error('Editor not initialized');
    return;
  }
  
  // Reset state - starting fresh
  isUserTurn = false;
  hasUserStartedTyping = false;
  updateTurnIndicator(false);
  window.timerControls.reset();
  editor.setEditable(false);
  
  // Temporarily set isUserTurn to false to prevent timer from starting during content clearing
  const wasUserTurn = isUserTurn;
  isUserTurn = false;
  
  // Clear editor content for fresh start
  editor.commands.setContent('');
  currentContent = '';
  
  // Restore the original state (though it should still be false)
  isUserTurn = wasUserTurn;
  
  // Get the selected genre
  const genreSelect = document.getElementById('genre-select');
  const selectedGenre = genreSelect.value;
  
  const startBtn = document.getElementById('startBtn');
  
  // Check if we're in Free Writing mode
  if (selectedGenre === 'freewriting') {
    console.log("Free Writing mode selected - user starts first");
    // In Free Writing mode, user starts first
    startBtn.disabled = false;
    startBtn.textContent = 'YOUR TURN';
    // Set to user's turn immediately
    startUserTurn();
  } else {
    // For all other genres, AI starts with a prompt
    startBtn.disabled = true;
    startBtn.textContent = 'AI IS WRITING...';
    
    // Get first prompt from LLM
    await getLLMResponse(selectedGenre);
    
    // After LLM response, it's user's turn
    startBtn.textContent = 'YOUR TURN';
    startBtn.disabled = false;
  }
}

// Start the user's turn
function startUserTurn() {
  console.log("Starting user's turn");
  isUserTurn = true;
  hasUserStartedTyping = false; // Reset for each new user turn
  updateTurnIndicator(true);
  editor.setEditable(true);
  document.getElementById('startBtn').textContent = 'YOUR TURN';
  
  // Make sure the timer is reset and showing full time
  window.timerControls.reset();
  
  // Focus the editor
  editor.commands.focus('end');
  
  // Extra check to ensure the editor is truly editable
  setTimeout(() => {
    if (!editor.isEditable) {
      console.log("Editor not editable, forcing editable state");
      editor.setEditable(true);
    }
  }, 100);
}

// End the user's turn and get LLM response
async function endUserTurn() {
  if (!isUserTurn) {
    console.log("Not user's turn, skipping endUserTurn");
    return;
  }
  
  console.log("Ending user's turn");
  isUserTurn = false;
  hasUserStartedTyping = false; // Reset typing state
  updateTurnIndicator(false);
  editor.setEditable(false); // Prevent further editing
  
  // Ensure timer is fully reset and ready for next user turn
  window.timerControls.reset();
  
  // Update button to indicate LLM is working
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.textContent = 'AI IS WRITING...';
  
  // Get the selected genre
  const genreSelect = document.getElementById('genre-select');
  const selectedGenre = genreSelect.value;
  
  // Get continuation from LLM based on current content
  await getLLMResponse(selectedGenre, currentContent);
  
  // After LLM response, it's user's turn again
  startBtn.textContent = 'YOUR TURN';
  startBtn.disabled = false;
}

// Get response from LLM
async function getLLMResponse(genre, existingContent = '') {
  console.log(`Getting LLM response for ${genre} genre${existingContent ? ' with existing content' : ' for new story'}`);
  
  // Ensure timer is reset before AI starts typing
  window.timerControls.reset();
  
  // Make sure we're in AI's turn state
  isUserTurn = false;
  hasUserStartedTyping = false;
  
  // Get the selected AI length
  const aiLengthSelect = document.getElementById('ai-length-select');
  const aiLength = aiLengthSelect.value;
  
  // Determine word count based on selected length
  let wordCount;
  switch (aiLength) {
    case 'short':
      wordCount = 'one sentence';
      break;
    case 'long':
      wordCount = '~150';
      break;
    case 'medium':
    default:
      wordCount = '~80';
  }
  
  console.log(`Using AI length: ${aiLength} (${wordCount} words)`);
  
  const systemPrompt = `You are a creative writer participating in a back-and-forth writing game. ${existingContent ? 'The user has written some text, and you must now continue the story.' : 'You will provide an inspiring prose-based opening to a creative writing story.'} Write in the specified genre style. Your contribution should be about ${wordCount} words. Only provide the text that continues or starts the story. Do not provide commentary, questions, or indicate that you are an AI. Do not use quotation marks around your text unless they are part of the story dialogue. Write compelling, vivid text that builds on what came before.`;
  
  let userPrompt;
  if (existingContent) {
    // For continuation, include the existing content
    userPrompt = `Continue this story in the style of ${genre} genre. Here is the story so far: ${stripHtml(existingContent)}`;
  } else {
    // For first prompt, use the genre template
    userPrompt = genrePrompts[genre];
  }
  
  // Add user input to conversation history
  if (existingContent) {
    addToConversation('user', stripHtml(existingContent));
  }

  const responseDiv = document.getElementById('response');
  responseDiv.textContent = 'Loading...';

  try {
    // Call your backend API
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        system: systemPrompt, 
        prompt: userPrompt, 
        aiLength: aiLength 
      })
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    responseDiv.textContent = ''; // Clear loading message
    
    // Add AI response to conversation history
    addToConversation('assistant', data.text);
    
    // Log conversation to server after AI responds
    logConversation();

    // Use emanateStringToEditor to display response
    await emanateStringToEditor(data.text, 30, () => {
      console.log('Emanation complete');
      // After emanation is complete, start user's turn
      startUserTurn();
    });
  } catch (error) {
    console.error('Error:', error);
    responseDiv.textContent = `Error: ${error.message}`;
    // Even on error, allow user to write
    startUserTurn();
  }
}

// Strip HTML tags for sending clean text to LLM
function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// Helper function to animate text into the editor
let emanationInProgress = false;
async function emanateStringToEditor(content, timeout = 30, onComplete = null) {
  if (!editor) {
    console.error('Editor not initialized');
    return;
  }

  let index = 0;
  emanationInProgress = true;
  
  function sendNextCharacter() {
    if (index < content.length) {
      emanateCharacterToEditor(content[index]);
      editor.commands.scrollIntoView();
      index++;
      setTimeout(sendNextCharacter, timeout);
    } else {
      emanateCharacterToEditor('\u00A0'); // add space at end
      editor.commands.scrollIntoView();
      emanationInProgress = false;
      if (onComplete) onComplete();
    }
  }
  
  sendNextCharacter();
  
  // Return a promise that resolves when emanation is complete
  return new Promise((resolve) => {
    const checkComplete = setInterval(() => {
      if (!emanationInProgress) {
        clearInterval(checkComplete);
        resolve();
      }
    }, 100);
  });
}

function emanateCharacterToEditor(character) {
  if (!editor) {
    console.error('Editor not initialized');
    return;
  }

  // Temporarily mark that this update is from AI, not user
  const wasUserTurn = isUserTurn;
  isUserTurn = false;
  
  editor.chain()
    .focus()
    .insertContent(character)
    .run();
    
  // Restore the original turn state
  isUserTurn = wasUserTurn;
}

// Add button state handlers
function setupButtonStateHandlers() {
  const startBtn = document.getElementById('startBtn');
  
  // Add the button-out class by default
  startBtn.classList.add('button-out');
  
  // Handle mousedown - switch to button-in state
  startBtn.addEventListener('mousedown', function() {
    if (!this.disabled) {
      this.classList.remove('button-out');
      this.classList.add('button-in');
    }
  });
  
  // Handle mouseup - switch back to button-out state
  startBtn.addEventListener('mouseup', function() {
    if (!this.disabled) {
      this.classList.remove('button-in');
      this.classList.add('button-out');
    }
  });
  
  // Handle mouseleave - ensure button returns to out state
  startBtn.addEventListener('mouseleave', function() {
    this.classList.remove('button-in');
    this.classList.add('button-out');
  });
  
  // Add similar functionality to any other buttons that need it
}

// Add this function to make the editor draggable with conventional styling
function makeEditorDraggable() {
  const editorContainer = document.getElementById('editor-container');
  let dragHandle = document.querySelector('.editor-drag-handle');
  
  // Only create the drag handle if it doesn't already exist
  if (!dragHandle) {
    // Create a drag handle for the editor
    dragHandle = document.createElement('div');
    dragHandle.className = 'editor-drag-handle';
    dragHandle.innerHTML = '<span class="drag-icon">☰</span> Editor';
    
    // Insert the drag handle at the beginning of the editor container
    editorContainer.insertBefore(dragHandle, editorContainer.firstChild);
  }
  
  // Add resize handles if they don't exist
  if (!document.querySelector('.resize-handle-e')) {
    const resizeHandles = [
      { class: 'resize-handle-e', cursor: 'ew-resize' },   // East (right)
      { class: 'resize-handle-s', cursor: 'ns-resize' },   // South (bottom)
      { class: 'resize-handle-se', cursor: 'nwse-resize' } // Southeast (corner)
    ];
    
    resizeHandles.forEach(handle => {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = `resize-handle ${handle.class}`;
      resizeHandle.style.cursor = handle.cursor;
      editorContainer.appendChild(resizeHandle);
    });
  }
  
  // Rest of the drag functionality...
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  let originalWidth = null;
  
  // Only attach event listener if it hasn't been attached already
  if (!dragHandle.hasAttribute('data-draggable')) {
    dragHandle.setAttribute('data-draggable', 'true');
    
    dragHandle.addEventListener('mousedown', function(e) {
      // Only start dragging if the click is on the drag handle itself
      // and not on any of its child controls
      if (e.target === dragHandle || e.target.classList.contains('drag-icon')) {
        dragMouseDown(e);
      }
    });
  }
  
  // Add resizing functionality
  const MIN_WIDTH = 400;  // Minimum width in pixels
  const MIN_HEIGHT = 300; // Minimum height in pixels
  
  let resizeEFunction, resizeSFunction, resizeSEFunction;
  
  // East (right) resize handle
  const handleE = document.querySelector('.resize-handle-e');
  if (handleE && !handleE.hasAttribute('data-resizable')) {
    handleE.setAttribute('data-resizable', 'true');
    
    resizeEFunction = function(e) {
      const newWidth = Math.max(MIN_WIDTH, e.clientX - editorContainer.getBoundingClientRect().left);
      editorContainer.style.width = newWidth + 'px';
    };
    
    handleE.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation(); // Prevent dragging from starting
      document.addEventListener('mousemove', resizeEFunction);
      document.addEventListener('mouseup', stopResize);
    });
  }
  
  // South (bottom) resize handle
  const handleS = document.querySelector('.resize-handle-s');
  if (handleS && !handleS.hasAttribute('data-resizable')) {
    handleS.setAttribute('data-resizable', 'true');
    
    resizeSFunction = function(e) {
      const newHeight = Math.max(MIN_HEIGHT, e.clientY - editorContainer.getBoundingClientRect().top);
      editorContainer.style.height = newHeight + 'px';
      
      // Also update the editor and ProseMirror height
      const editorElement = document.getElementById('editor');
      if (editorElement) {
        editorElement.style.height = (newHeight - 60) + 'px'; // Subtracting header height
      }
    };
    
    handleS.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation(); // Prevent dragging from starting
      document.addEventListener('mousemove', resizeSFunction);
      document.addEventListener('mouseup', stopResize);
    });
  }
  
  // Southeast (corner) resize handle
  const handleSE = document.querySelector('.resize-handle-se');
  if (handleSE && !handleSE.hasAttribute('data-resizable')) {
    handleSE.setAttribute('data-resizable', 'true');
    
    resizeSEFunction = function(e) {
      const newWidth = Math.max(MIN_WIDTH, e.clientX - editorContainer.getBoundingClientRect().left);
      const newHeight = Math.max(MIN_HEIGHT, e.clientY - editorContainer.getBoundingClientRect().top);
      
      editorContainer.style.width = newWidth + 'px';
      editorContainer.style.height = newHeight + 'px';
      
      // Also update the editor and ProseMirror height
      const editorElement = document.getElementById('editor');
      if (editorElement) {
        editorElement.style.height = (newHeight - 60) + 'px'; // Subtracting header height
      }
    };
    
    handleSE.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation(); // Prevent dragging from starting
      document.addEventListener('mousemove', resizeSEFunction);
      document.addEventListener('mouseup', stopResize);
    });
  }
  
  // This is the key function that needs fixing
  function stopResize() {
    document.removeEventListener('mousemove', resizeEFunction);
    document.removeEventListener('mousemove', resizeSFunction);
    document.removeEventListener('mousemove', resizeSEFunction);
    document.removeEventListener('mouseup', stopResize);
    
    // Add visual feedback that resize is complete
    editorContainer.classList.remove('resizing');
    
    // Log to console to confirm stopResize was called
    console.log('Resize stopped');
  }
  
  // Add this to your CSS to show when resizing is happening
  // Add a class when resizing starts
  const addResizingClass = function(e) {
    editorContainer.classList.add('resizing');
  };
  
  if (handleE) handleE.addEventListener('mousedown', addResizingClass);
  if (handleS) handleS.addEventListener('mousedown', addResizingClass);
  if (handleSE) handleSE.addEventListener('mousedown', addResizingClass);
  
  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Store the original width before positioning changes
    if (!originalWidth) {
      originalWidth = editorContainer.offsetWidth;
    }
    
    editorContainer.classList.add('dragging');
    
    document.addEventListener('mouseup', closeDragElement);
    document.addEventListener('mousemove', elementDrag);
  }
  
  function elementDrag(e) {
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set the element's new position
    const newTop = (editorContainer.offsetTop - pos2);
    const newLeft = (editorContainer.offsetLeft - pos1);
    
    // Apply position using direct style properties
    editorContainer.style.position = 'absolute';
    editorContainer.style.top = newTop + 'px';
    editorContainer.style.left = newLeft + 'px';
    editorContainer.style.margin = '0';
    editorContainer.style.width = originalWidth + 'px'; // Set fixed width to maintain size
  }
  
  function closeDragElement() {
    document.removeEventListener('mouseup', closeDragElement);
    document.removeEventListener('mousemove', elementDrag);
    editorContainer.classList.remove('dragging');
  }
}

// Initialize style switcher
function initStyleSwitcher() {
  const styleSwitcher = document.getElementById('style-switcher');
  const styleSheet = document.getElementById('style-sheet');
  
  // Apply the saved UI mode
  if (uiMode === 'tui') {
    styleSheet.href = 'tui.css';
    styleSwitcher.textContent = 'Standard Mode';
    document.body.classList.add('tui-mode');
    // Apply green filter to emoji in TUI mode
    document.querySelectorAll('.drag-icon').forEach(el => {
      el.classList.add('green-emoji');
    });
  } else {
    styleSheet.href = 'style.css';
    styleSwitcher.textContent = 'TUI Mode';
    document.body.classList.remove('tui-mode');
  }
  
  // Style switcher click handler
  styleSwitcher.addEventListener('click', () => {
    if (styleSheet.href.includes('tui.css')) {
      // Switch to standard mode
      styleSheet.href = 'style.css';
      styleSwitcher.textContent = 'TUI Mode';
      document.body.classList.remove('tui-mode');
      uiMode = 'standard';
      // Remove green filter from emoji
      document.querySelectorAll('.drag-icon').forEach(el => {
        el.classList.remove('green-emoji');
      });
    } else {
      // Switch to TUI mode
      styleSheet.href = 'tui.css';
      styleSwitcher.textContent = 'Standard Mode';
      document.body.classList.add('tui-mode');
      uiMode = 'tui';
      // Apply green filter to emoji in TUI mode
      document.querySelectorAll('.drag-icon').forEach(el => {
        el.classList.add('green-emoji');
      });
    }
    
    // Save preference to localStorage
    localStorage.setItem('ghostwriter-ui-mode', uiMode);
  });
}

// Logging functions
async function logConversation() {
  try {
    // Get current settings
    const genreSelect = document.getElementById('genre-select');
    const timerSelect = document.getElementById('timer-select');
    const aiLengthSelect = document.getElementById('ai-length-select');
    
    const settings = {
      genre: genreSelect.value,
      timer: timerSelect.value,
      aiLength: aiLengthSelect.value,
      uiMode: uiMode
    };
    
    // Get metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      sessionId: getOrCreateSessionId()
    };
    
    // Send log to server
    const response = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation,
        settings,
        metadata
      })
    });
    
    if (!response.ok) {
      console.error('Failed to log conversation:', await response.text());
    }
  } catch (error) {
    console.error('Error logging conversation:', error);
  }
}

// Generate or retrieve session ID
function getOrCreateSessionId() {
  let sessionId = sessionStorage.getItem('ghostwriter-session-id');
  if (!sessionId) {
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2);
    sessionStorage.setItem('ghostwriter-session-id', sessionId);
  }
  return sessionId;
}

// Track conversation for logging
function addToConversation(role, content) {
  conversation.push({ role, content, timestamp: new Date().toISOString() });
}

// The main initialization function should be called after DOM is loaded
function initializeApp() {
  // Initialize editor draggability
  makeEditorDraggable();
  
  // Initialize button state handlers
  setupButtonStateHandlers();
  
  // Initialize style switcher
  initStyleSwitcher();
  
  // Initialize floating timer
  initFloatingTimer();
  
  // Set initial editor size and position
  centerEditorOnLoad();
}

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', initializeApp);
