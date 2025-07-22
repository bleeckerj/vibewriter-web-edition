import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

// Initialize editor variable at the module level
let editor;
let currentContent = ''; // Track content for LLM context
let currentTurn = 'ai'; // Track whose turn it is
let isUserTurn = false; // Keep for backward compatibility
let isEditing = false; // Add this missing variable
let isTimerActive = false;
let hasUserStartedTyping = false; // Track if user has started typing in the current turn
let conversation = []; // Track conversation for logging
let uiMode = localStorage.getItem('ghostwriter-ui-mode') || 'standard'; // 'standard' or 'tui'
let contentBeforeUserTurn = ''; // Track content before user starts typing
let userWordCount = 0; // Track word count of user's latest addition

// Genre prompts
const genrePrompts = {
  hardboiled: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of a hard boiled detective novel. For example, something in the style of Raymond Chandler, Elmore Leonard, Dashiell Hammett. The protagonist is a street smart, wise-cracking, private investigator. There is a femme fatale character, typically a beautiful woman, who becomes the protagonist's undoing. The genre includes gritty settings like back alleys, dingy bars, drinking, seedy journalists, street-smart hookers, pay-by-the-hour motels, single-room occupancy flop houses, cigarette smoking, crooked cops, various forms of malfeasence, criminals, hard drinking colleagues, jealous women. The settings have the characteristics of the 1950s in urban settings, although 'futuristic' hard boiled contexts are also viable, such as like Blade Runner, Altered Carbon, or the works of William Gibson. The writing style should be terse, with a focus on dialogue and action, and a tone that is cynical and world-weary. The story should include elements of mystery, crime, and moral ambiguity, with a plot that involves a complex case that the protagonist must solve while navigating a dangerous underworld.`,
  
  fantasy: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of high fantasy. Think Tolkien, George R.R. Martin, or Terry Pratchett. Include elements such as magic, mythical creatures, ancient prophecies, or epic quests. Set in a medieval-inspired world with its own unique cultures, races, and geography. Focus on world-building and establishing a sense of wonder and adventure.`,
  
  scifi: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of science fiction. Consider authors like Isaac Asimov, Ursula K. Le Guin, or Neal Stephenson. Include elements such as advanced technology, space exploration, artificial intelligence, or dystopian/utopian societies. Focus on the impact of scientific advancement on humanity and society, exploring philosophical and ethical questions through a technological lens.`,
  
  cyberpunk: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of cyberpunk fiction. Think William Gibson, Neal Stephenson, or Philip K. Dick. Includes elements such as neon-drenched cityscape where towering skyscrapers pierce the perpetual rain, the line between human and machine blurs. Corporate megasystems control every aspect of life, while hackers, mercenaries, and augmented outcasts fight in the shadows. The air hums with electric tension and the glow of holographic ads, masking the decay beneath. Write a gritty, immersive narrative capturing the mood of urban alienation, high-tech intrigue, and the desperate struggle for freedom in a dystopian future. Consider a main character who is an expert hacker, steady in their resolve to achieve the ultimate hack and to liberate the masses from their fate under the thumb of the powerful elites who control their lives and their thoughts. Analogize to contemporary disparties where the 1% of the 1% own 99.9% of the power and the wealth.`,

  horror: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of horror fiction. Think Stephen King, H.P. Lovecraft, or Shirley Jackson. Create an atmosphere of dread, unease, or impending doom. Include elements such as the supernatural, psychological terror, or unsettling scenarios that play on common fears. Focus on building tension and creating a sense of the unknown.`,
  
  romance: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of romance fiction. Consider authors like Jane Austen, Nicholas Sparks, or Nora Roberts. Focus on emotional connection, longing, or the first encounter between potential lovers. Establish characters with chemistry, include elements of attraction, and hint at obstacles or complications that might stand in the way of their relationship.`,
  
  western: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a long paragraph of text in the style of a western novel. Think Cormac McCarthy, Louis L'Amour, or Zane Grey. Include elements such as frontier life, cowboys, lawmen, outlaws, or settlers. Set in the American West of the 19th century, with rugged landscapes, small frontier towns, and the conflict between civilization and wilderness. Focus on themes of justice, survival, honor, or redemption.`,
  
  poetry: `Generate a compelling poetic opening for a creative writing exercise. Provide a stanza of about 4-6 lines with evocative imagery, metaphor, and rhythm. The poem should have emotional depth and create a strong sense of atmosphere or feeling. It can be in any poetic style but should be accessible and impactful, serving as inspiration for further creative writing.`,
  
  solarpunk: `Generate a compelling opening phrase or sentence for a creative writing exercise. Provide a paragraph of text in the style of a Solarpunk science fiction adventure novel set in a fictional land where there are AI companions who are like benevolent muses for people who are now able to fully actualize their true selves as creators, craftspeople, traders, explorers, adventurers, community builders, farmers, builders of homes, and technologists. Solarpunk is a genre of science fiction that envisions a future where technology and nature coexist harmoniously, often featuring themes of sustainability, community, and social justice. The story should be set in a world where people have access to advanced AI companions that help them achieve their goals and dreams. The writing style should be engaging, imaginative, and optimistic, reflecting the hopeful and positive nature of the Solarpunk genre.`,

  rap: `Generate a compelling opening for a creative writing exercise. Provide a verse in the style of modern rap lyrics. Use rhyme, rhythm, and wordplay. The lyrics should have a strong voice, clever metaphors, and vivid imagery. Channel the energy and style of artists like Kendrick Lamar, Nicki Minaj, or J. Cole. Avoid explicit content, but keep it authentic and impactful.`
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
    indicator.textContent = "🧠";
    // indicator.style.backgroundColor = '#15803d'; // green
    indicator.style.transform = 'translateX(-50%) scale(1.05)'; // Make it slightly larger for user turn
  } else {
    indicator.textContent = "🤖";
    // indicator.style.backgroundColor = '#3b82f6'; // blue
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
          
          // Update save button state whenever content changes
          updateSaveButtonState();
          
          // If it's the user's turn and they haven't started typing yet
          if (isUserTurn && !hasUserStartedTyping) {
            console.log("First keystroke detected");
            
            // Check if the editor content contains any non-whitespace character
            const plainText = stripHtml(editor.getHTML());
            if (plainText.replace(/\s/g, '').length > 0) {
              if (window.timerControls && typeof window.timerControls.isActive === 'function') {
                // Only start timer if it's not already active
                if (!window.timerControls.isActive()) {
                  console.log("Starting timer (user typed non-whitespace)");
                  hasUserStartedTyping = true;
                  window.timerControls.start();
                  
                  // Keep indicator showing brain emoji for user's turn
                  const indicator = document.getElementById('turn-indicator');
                  if (indicator) {
                    indicator.textContent = "🧠";
                  }
                }
              } else {
                // Even without timer, mark that typing has started
                hasUserStartedTyping = true;
                console.warn("Timer controls not found or not initialized");
              }
            }
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

// Initialize the timer controls
function initializeTimer() {
  // Create timerControls object if it doesn't exist
  if (!window.timerControls) {
    console.log("Initializing timer controls");
    
    const floatingTimer = document.getElementById('floating-timer');
    
    if (!floatingTimer) {
      console.error("Timer element not found");
      return;
    }
    
    // Get the timer value from the dropdown
    const timerSelect = document.getElementById('timer-select');
    let timerDuration = timerSelect ? parseInt(timerSelect.value) : 60; // default to 60 seconds
    
    console.log(`Setting initial timer duration to ${timerDuration} seconds`);
    
    // Listen for changes to the timer selection
    if (timerSelect) {
      timerSelect.addEventListener('change', function() {
        timerDuration = parseInt(this.value);
        console.log(`Timer duration changed to ${timerDuration} seconds`);
        
        if (window.timerControls) {
          window.timerControls.setDuration(timerDuration);
          window.timerControls.reset();
        } else {
          // If timer controls don't exist yet, initialize them
          initializeTimer();
        }
      });
    }
    
    // Create timer controls
    window.timerControls = {
      duration: timerDuration,
      remaining: timerDuration,
      interval: null,
      isRunning: false,
      
      setDuration: function(seconds) {
        this.duration = seconds;
        this.remaining = seconds;
        this.updateDisplay();
      },
      
      start: function() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        const that = this;
        
        // Highlight the timer when running
        floatingTimer.classList.add('timer-active');
        
        // Clear any existing interval
        if (this.interval) clearInterval(this.interval);
        
        const startTime = Date.now();
        const initialRemaining = this.remaining;
        
        this.interval = setInterval(function() {
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
          that.remaining = Math.max(0, initialRemaining - elapsedSeconds);
          
          that.updateDisplay();
          
          if (that.remaining <= 0) {
            that.stop();
            // When timer ends, call endUserTurn to trigger AI response
            endUserTurn();
          }
        }, 100);
      },
      
      stop: function() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        clearInterval(this.interval);
        this.interval = null;
        floatingTimer.classList.remove('timer-active');
      },
      
      reset: function() {
        this.stop();
        this.remaining = this.duration;
        this.updateDisplay();
      },
      
      isActive: function() {
        return this.isRunning;
      },
      
      updateDisplay: function() {
        const minutes = Math.floor(this.remaining / 60);
        const seconds = this.remaining % 60;
        floatingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    };
    
    // Initialize the display
    window.timerControls.reset();
    
    console.log("Timer controls initialized with duration:", timerDuration);
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
  userWordCount = 0; // Clear previous word count
  contentBeforeUserTurn = ''; // Clear previous content tracking
  conversation = []; // Clear conversation history
  
  updateTurnIndicator(false);
  
  // Reset timer if it's initialized
  if (window.timerControls && typeof window.timerControls.reset === 'function') {
    window.timerControls.reset();
  }
  
  editor.setEditable(false);
  
  // Temporarily set isUserTurn to false to prevent timer from starting during content clearing
  const wasUserTurn = isUserTurn;
  isUserTurn = false;
  
  // Clear editor content for fresh start
  editor.commands.setContent('');
  currentContent = '';
  
  // Update save button state after clearing content
  updateSaveButtonState();
  
  // Restore the original state (though it should still be false)
  isUserTurn = wasUserTurn;
  
  // Get the selected genre
  const genreSelect = document.getElementById('genre-select');
  const selectedGenre = genreSelect.value;
  
  const startBtn = document.getElementById('startBtn');
  
  console.log('Starting new session - word count reset to 0');
  
  // Check if we're in Free Writing mode
  if (selectedGenre === 'freewriting') {
    console.log("Free Writing mode selected - user starts first");
    // In Free Writing mode, user starts first
    startBtn.disabled = false;
    // Set to user's turn immediately
    startUserTurn();
  } else {
    // For all other genres, AI starts with a prompt
    startBtn.disabled = true;
    
    // Force button to return to 'out' state when disabled
    startBtn.classList.remove('button-in');
    startBtn.classList.add('button-out');
    
    // Get first prompt from LLM
    await getLLMResponse(selectedGenre);
    
    // After LLM response, it's user's turn
    startBtn.disabled = false;
  }
}

// Start the user's turn
function startUserTurn() {
  console.log("Starting user's turn");
  currentTurn = 'user';
  isUserTurn = true;
  isEditing = true;
  hasUserStartedTyping = false;
  
  // Capture content before user starts typing - convert to plain text
  contentBeforeUserTurn = stripHtml(editor.getHTML()); // Fixed: use stripHtml instead of stripHtml
  console.log('Content before user turn:', contentBeforeUserTurn);
  
  updateTurnIndicator(true);
  editor.setEditable(true);
  
  // Make sure the timer is reset and showing full time
  if (window.timerControls && typeof window.timerControls.reset === 'function') {
    window.timerControls.reset();
  }
  
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
  console.log("=== End User Turn Called ===");

  if (currentTurn !== 'user') {
    console.log("Not user's turn, exiting");
    return;
  }

  currentTurn = 'ai';
  isUserTurn = false;
  isEditing = false;
  
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.disabled = true;
  
  updateTurnIndicator(false);
  
  // Calculate user's word count by comparing text content (not HTML)
  const contentBeforeUser = contentBeforeUserTurn || '';
  const contentAfterUser = editor.getHTML();
  
  // Strip HTML and trim whitespace for accurate comparison
  const plainBefore = stripHtml(contentBeforeUser).trim();
  const plainAfter = stripHtml(contentAfterUser).trim();

  let userAddedText = '';
  if (plainAfter.length > plainBefore.length) {
    // User added content - find what was added
    if (plainAfter.startsWith(plainBefore)) {
      userAddedText = plainAfter.substring(plainBefore.length).trim();
    } else if (plainAfter.endsWith(plainBefore)) {
      userAddedText = plainAfter.substring(0, plainAfter.length - plainBefore.length).trim();
    } else {
      // Content was inserted/modified, fallback to word count difference
      userAddedText = plainAfter; // fallback: treat all as new
    }
  } else {
    userAddedText = '';
  }

  // Only count words if userAddedText contains non-whitespace
  userWordCount = userAddedText && userAddedText.replace(/\s/g, '').length > 0
    ? countWords(userAddedText)
    : 0;

  console.log('Final user word count:', userWordCount);
  console.log('User added text:', userAddedText);

  if (userWordCount > 0) {
    logToConsole(`User added ${userWordCount} words: "${userAddedText.substring(0, 100)}${userAddedText.length > 100 ? '...' : ''}"`);
  } else {
    logToConsole('User did not add any words');
  }

  // If user added no meaningful words, restart timer and notify
  if (userWordCount === 0) {
    logToConsole('Please contribute something meaningful before the timer runs out!', 'warning');
    if (window.timerControls && typeof window.timerControls.reset === 'function') {
      window.timerControls.reset(); // Only reset, do NOT start
    }
    editor.commands.focus('end');
    currentTurn = 'user';
    isUserTurn = true;
    isEditing = true;
    hasUserStartedTyping = false;
    return; // Do not proceed to AI turn
  }
  
  // Continue with LLM response after a short delay
  setTimeout(() => {
    // Get the current editor content to provide context
    const currentEditorContent = editor.getHTML();
    getLLMResponse(getSelectedGenre(), currentEditorContent);
  }, 500);
}

// Get response from LLM
async function getLLMResponse(genre, existingContent = '') {
  console.log(`Getting LLM response for ${genre} genre${existingContent ? ' with existing content' : ' for new story'}`);
  
  // Ensure timer is reset before AI starts typing - check if timer exists first
  if (window.timerControls && typeof window.timerControls.reset === 'function') {
    window.timerControls.reset();
  } else {
    console.warn('Timer controls not initialized yet');
  }
  
  // Make sure we're in AI's turn state
  isUserTurn = false;
  hasUserStartedTyping = false;
  
  // Get the selected AI length
  const aiLengthSelect = document.getElementById('ai-length-select');
  const aiLength = aiLengthSelect.value;
  
  // Determine word count based on user's input or selected length
  let wordCount;
  if (aiLength === 'match' && userWordCount > 0) {
    // Use user's word count for matching response length
    wordCount = `approximately ${userWordCount}`;
    console.log(`Using user word count: ${userWordCount} words`);
    logToConsole(`AI will respond with ~${userWordCount} words to match your input`, 'success');
  } else if (aiLength === 'match' && userWordCount === 0) {
    // If "match" is selected but no user word count, fall back to medium
    wordCount = '~80';
    console.log(`Match selected but no user input yet, falling back to medium length`);
    logToConsole(`Match selected but no user input yet, using medium length`, 'info');
  } else {
    // Use selected AI length
    switch (aiLength) {
      case 'short':
      wordCount = 'one sentence';
      break;
      case 'long':
      wordCount = '~100';
      break;
      case 'medium':
      default:
      wordCount = '~80';
    }
    console.log(`Using AI length: ${aiLength} (${wordCount} words)`);
    logToConsole(`Using AI muse length setting: ${aiLength} (${wordCount} words)`, 'info');
  }
  
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
    const requestBody = { 
      system: systemPrompt, 
      prompt: userPrompt, 
      aiLength: aiLength
    };
    
    // Only include user word count if "match" is selected
    if (aiLength === 'match') {
      requestBody.userWordCount = userWordCount;
    }
    
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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

// Add the missing stripHtml function (note the capital HTML)
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// Also add getSelectedGenre function that was referenced but missing
function getSelectedGenre() {
  const genreSelect = document.getElementById('genre-select');
  return genreSelect ? genreSelect.value : 'hardboiled';
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
      
      // Update save button state after AI content is complete
      updateSaveButtonState();
      
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
  
  // Always insert AI content at the end of the document
  editor.chain()
  .focus('end')  // Focus at the end of the document
  .insertContent(character)
  .run();
  
  // Restore the original turn state
  isUserTurn = wasUserTurn;
}

// Generalized function to set up button UI interaction and click handler
function setupButtonUI(button, onClick) {
  if (!button) return;
  
  console.log('Setting up button UI for:', button.id || button.className);
  
  // Add the button-out class by default
  button.classList.add('button-out');
  console.log('Added button-out class to:', button.id || button.className);
  
  // Handle mousedown - switch to button-in state
  button.addEventListener('mousedown', function() {
    console.log('Mousedown on button:', this.id || this.className, 'disabled:', this.disabled);
    if (!this.disabled) {
      this.classList.remove('button-out');
      this.classList.add('button-in');
      console.log('Added button-in class to:', this.id || this.className);
      console.log('Button classes after mousedown:', this.classList.toString());
    }
  });
  
  // Handle mouseup - switch back to button-out state
  button.addEventListener('mouseup', function() {
    console.log('Mouseup on button:', this.id || this.className, 'disabled:', this.disabled);
    if (!this.disabled) {
      this.classList.remove('button-in');
      this.classList.add('button-out');
      console.log('Added button-out class to:', this.id || this.className);
      console.log('Button classes after mouseup:', this.classList.toString());
    }
  });
  
  // Handle mouseleave - ensure button returns to out state
  button.addEventListener('mouseleave', function() {
    console.log('Mouseleave on button:', this.id || this.className);
    this.classList.remove('button-in');
    this.classList.add('button-out');
    console.log('Button classes after mouseleave:', this.classList.toString());
  });
  
  // Assign the provided click handler
  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }
}

// Add this function to make the editor draggable with conventional styling
function makeEditorDraggable() {
  const editorContainer = document.getElementById('editor-container');
  let dragHandle = document.querySelector('.editor-drag-handle');
  
  // Use the menu button as drag handle
  dragHandle = document.getElementById('menu-button');
  
  // If menu button doesn't exist, create a fallback drag handle
  if (!dragHandle) {
    console.log("Menu button not found, creating fallback drag handle");
    dragHandle = document.createElement('div');
    dragHandle.className = 'editor-drag-handle';
    dragHandle.innerHTML = '<span class="drag-icon">☰</span> Editor';
    
    // Insert the fallback drag handle at the beginning of the editor container
    editorContainer.insertBefore(dragHandle, editorContainer.firstChild);
  }
  
  // Get all toolbar elements that should be draggable
  const toolbarElements = [
    document.getElementById('menu-button'),
    document.querySelector('.editor-toolbar.top-row'),
    document.querySelector('.editor-toolbar.bottom-row'),
    document.querySelector('.turn-indicator')
  ].filter(el => el !== null);
  
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
  //let originalWidth = null;
  
  // Function to constrain position within viewport bounds
  function constrainToViewport(left, top, width, height) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const topMenuHeight = document.querySelector('.top-menu-bar')?.offsetHeight || 0;
    
    // Constrain horizontal position - editor must stay fully within viewport
    const maxLeft = viewportWidth - width;
    const minLeft = 0;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    
    // Constrain vertical position - editor must stay fully within viewport
    const maxTop = viewportHeight - height;
    const minTop = topMenuHeight;
    top = Math.max(minTop, Math.min(maxTop, top));
    
    return { left, top };
  }
  
  // Attach drag event listeners to all toolbar elements
  toolbarElements.forEach(element => {
    if (!element.hasAttribute('data-draggable')) {
      element.setAttribute('data-draggable', 'true');
      element.style.cursor = 'move';
      
      element.addEventListener('mousedown', function(e) {
        // Only start dragging if clicking on non-interactive elements
        const target = e.target;
        const isButton = target.tagName === 'BUTTON' || target.closest('button');
        const isSelect = target.tagName === 'SELECT' || target.closest('select');
        const isInput = target.tagName === 'INPUT' || target.closest('input');
        
        // Special case: allow dragging from the hamburger menu button (menu-button)
        const isMenuButton = target.id === 'menu-button' || target.closest('#menu-button');
        
        const isInteractive = (isButton || isSelect || isInput) && !isMenuButton;
        
        // Allow dragging from the toolbar area and from the hamburger menu button
        if (!isInteractive) {
          dragMouseDown(e);
        }
      });
    }
  });
  
  // Add resizing functionality
  const MIN_WIDTH = 400;  // Minimum width in pixels
  const MIN_HEIGHT = 300; // Minimum height in pixels
  
  let resizeEFunction, resizeSFunction, resizeSEFunction;
  
  // East (right) resize handle
  const handleE = document.querySelector('.resize-handle-e');
  if (handleE && !handleE.hasAttribute('data-resizable')) {
    handleE.setAttribute('data-resizable', 'true');
    
    resizeEFunction = function(e) {
      const rect = editorContainer.getBoundingClientRect();
      const maxWidth = window.innerWidth - rect.left - 20; // 20px margin from right edge
      const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, e.clientX - rect.left));
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
      const rect = editorContainer.getBoundingClientRect();
      const maxHeight = window.innerHeight - rect.top - 20; // 20px margin from bottom edge
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, e.clientY - rect.top));
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
      const rect = editorContainer.getBoundingClientRect();
      const maxWidth = window.innerWidth - rect.left - 20;
      const maxHeight = window.innerHeight - rect.top - 20;
      const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, e.clientX - rect.left));
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, e.clientY - rect.top));
      
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
    // if (!originalWidth) {
    //   originalWidth = editorContainer.offsetWidth;
    // }
    
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
    
    // Calculate the new position
    const newTop = (editorContainer.offsetTop - pos2);
    const newLeft = (editorContainer.offsetLeft - pos1);
    
    // Get current dimensions
    const width = editorContainer.offsetWidth;
    const height = editorContainer.offsetHeight;
    
    // Constrain to viewport bounds
    const constrainedPos = constrainToViewport(newLeft, newTop, width, height);
    
    // Apply position using direct style properties
    editorContainer.style.position = 'absolute';
    editorContainer.style.top = constrainedPos.top + 'px';
    editorContainer.style.left = constrainedPos.left + 'px';
    editorContainer.style.margin = '0';
    //editorContainer.style.width = originalWidth + 'px'; // Set fixed width to maintain size
  }
  
  function closeDragElement() {
    document.removeEventListener('mouseup', closeDragElement);
    document.removeEventListener('mousemove', elementDrag);
    editorContainer.classList.remove('dragging');
  }
  
  // Add window resize listener to reposition editor if it goes out of bounds
  window.addEventListener('resize', function() {
    const rect = editorContainer.getBoundingClientRect();
    const constrainedPos = constrainToViewport(
      editorContainer.offsetLeft, 
      editorContainer.offsetTop, 
      rect.width, 
      rect.height
    );
    
    if (constrainedPos.left !== editorContainer.offsetLeft || constrainedPos.top !== editorContainer.offsetTop) {
      editorContainer.style.left = constrainedPos.left + 'px';
      editorContainer.style.top = constrainedPos.top + 'px';
    }
  });
}

// Initialize style switcher
function initStyleSwitcher() {
  const styleSwitcher = document.getElementById('style-switcher');
  const styleSheet = document.getElementById('style-sheet');
  
  // Apply the saved UI mode
  if (uiMode === 'tui') {
    styleSheet.href = 'tui.css';
    styleSwitcher.textContent = 'STD';
    document.body.classList.add('tui-mode');
    // Apply green filter to emoji in TUI Style
    document.querySelectorAll('.drag-icon').forEach(el => {
      el.classList.add('green-emoji');
    });
  } else {
    styleSheet.href = 'style.css';
    styleSwitcher.textContent = 'TUI';
    document.body.classList.remove('tui-mode');
  }
  
  // Style switcher click handler
  styleSwitcher.addEventListener('click', () => {
    if (styleSheet.href.includes('tui.css')) {
      // Switch to standard mode
      styleSheet.href = 'style.css';
      styleSwitcher.textContent = 'TUI';
      document.body.classList.remove('tui-mode');
      uiMode = 'standard';
      // Remove green filter from emoji
      document.querySelectorAll('.drag-icon').forEach(el => {
        el.classList.remove('green-emoji');
      });
    } else {
      // Switch to TUI Style
      styleSheet.href = 'tui.css';
      styleSwitcher.textContent = 'STD';
      document.body.classList.add('tui-mode');
      uiMode = 'tui';
      // Apply green filter to emoji in TUI Style
      document.querySelectorAll('.drag-icon').forEach(el => {
        el.classList.add('green-emoji');
      });
    }
    
    // Store the preference
    localStorage.setItem('uiMode', uiMode);
    
    // Re-create custom dropdowns after a small delay to ensure the stylesheet has switched
    setTimeout(() => {
      // First, remove existing custom dropdowns
      document.querySelectorAll('.custom-select-container').forEach(container => {
        const select = container.querySelector('select');
        if (select) {
          select.style.display = '';
          container.parentNode.insertBefore(select, container);
        }
        container.remove();
      });
      
      // Then create new ones
      createCustomDropdowns();
    }, 100);
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
  // First initialize the timer controls (needed by other functions)
  initializeTimer();
  
  // Initialize editor
  initializeEditor();
  
  // Initialize editor draggability
  makeEditorDraggable();
  
  createCustomDropdowns();
  
  // Initialize style switcher
  initStyleSwitcher();
  
  // Initialize floating timer draggability
  initFloatingTimer();
  
  // Set initial editor size and position
  centerEditorOnLoad();
  
  // Set up START button with generalized UI and click handler
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    setupButtonUI(startBtn, handleStartButtonClick);
    console.log('Start button UI and event handler set up');
  } else {
    console.error('Start button not found');
  }
  
  // Set up SAVE button with generalized UI and click handler
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    setupButtonUI(saveBtn, handleSaveButtonClick);
    console.log('Save button UI and event handler set up');
    
    // Initialize save button state
    updateSaveButtonState();
  } else {
    console.error('Save button not found');
  }
  
  // Set up style-switcher button with generalized UI and click handler
  const styleSwitcher = document.getElementById('style-switcher');
  if (styleSwitcher) {
    // Remove any duplicate click handlers if present
    const newStyleSwitcher = styleSwitcher.cloneNode(true);
    styleSwitcher.parentNode.replaceChild(newStyleSwitcher, styleSwitcher);
    // Add TUI visual class for consistent style
    newStyleSwitcher.classList.add('primary-btn');
    setupButtonUI(newStyleSwitcher, function(e) {
      // Let the original click handler (initStyleSwitcher) handle the logic
      // This is just for UI feedback
    });
    // Re-initialize style switcher logic
    initStyleSwitcher();
    console.log('Style switcher button UI and TUI style set up');
  } else {
    console.error('Style switcher button not found');
  }
  
  // Set up TUI style buttons with generalized UI and click handler
  // All buttons with class 'tui-btn' will get the same UI interaction logic
  const tuiButtons = document.querySelectorAll('.tui-btn');
  tuiButtons.forEach(btn => {
    // If the button already has a click handler, preserve it
    // Otherwise, just set up the UI interaction
    // You can assign a handler via btn.dataset.onclick if needed
    let handler = null;
    if (btn.dataset && btn.dataset.onclick && typeof window[btn.dataset.onclick] === 'function') {
      handler = window[btn.dataset.onclick];
    }
    setupButtonUI(btn, handler);
  });
  
  // Add event listener for genre select change
  const genreSelect = document.getElementById('genre-select');
  if (genreSelect) {
    genreSelect.addEventListener('change', async function() {
      console.log(`Genre changed to: ${this.value}`);
      
      // Reset editor and state
      editor.commands.setContent('');
      currentContent = '';
      
      // Update save button state after clearing content
      updateSaveButtonState();
      
      // Make the editor not editable during LLM response
      editor.setEditable(false);
      
      // Update button UI - button text stays the same, just disable it
      const startBtn = document.getElementById('startBtn');
      startBtn.disabled = true;
      
      // Get the selected genre
      const selectedGenre = this.value;
      
      // In handleStartButtonClick, after disabling the button:
      if (selectedGenre === 'freewriting') {
        console.log("Free Writing mode selected - user starts first");
        startBtn.disabled = false;
        startUserTurn();
      } else {
        // For all other genres, AI starts with a prompt
        startBtn.disabled = true;
        
        // Force button to return to 'out' state when disabled
        startBtn.classList.remove('button-in');
        startBtn.classList.add('button-out');
        
        // Get first prompt from LLM
        await getLLMResponse(selectedGenre);
        
        // After LLM response, it's user's turn
        startBtn.disabled = false;
      }
    });
    console.log('Genre select event listener added');
  } else {
    console.error('Genre select not found');
  }
}

// Listen for AI length changes and log to console
document.addEventListener('DOMContentLoaded', () => {
  const aiLengthSelect = document.getElementById('ai-length-select');
  if (aiLengthSelect) {
    aiLengthSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      const label = {
        short: "Short",
        medium: "Medium",
        long: "Long",
        match: "Match User"
      }[value] || value;
      const msg = `AI muse length set to: ${label}`;
      console.log(msg);

      // If you have an in-app console, display there too:
      const consoleMessages = document.getElementById('console-messages');
      if (consoleMessages) {
        const div = document.createElement('div');
        div.textContent = msg;
        consoleMessages.appendChild(div);
        // Optionally scroll to bottom
        consoleMessages.scrollTop = consoleMessages.scrollHeight;
      }
    });
  }
});

// Function to create custom select dropdowns
function createCustomDropdowns() {
  // Find all select elements
  const selects = document.querySelectorAll('select');
  
  selects.forEach(select => {
    // Skip if already converted
    if (select.parentNode.classList.contains('custom-select-container')) return;
    
    // Create container
    const container = document.createElement('div');
    container.className = 'custom-select-container';
    select.parentNode.insertBefore(container, select);
    
    // Create trigger element
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.textContent = select.options[select.selectedIndex].textContent;
    container.appendChild(trigger);
    
    // Create options container
    const options = document.createElement('div');
    options.className = 'custom-options';
    container.appendChild(options);
    
    // Hide original select
    select.style.display = 'none';
    container.appendChild(select);
    
    // Add options
    Array.from(select.options).forEach(option => {
      const customOption = document.createElement('div');
      customOption.className = 'custom-option';
      customOption.textContent = option.textContent;
      customOption.dataset.value = option.value;
      if (option.selected) customOption.classList.add('selected');
      
      customOption.addEventListener('click', () => {
        // Update original select value
        select.value = customOption.dataset.value;
        
        // Update trigger text
        trigger.textContent = customOption.textContent;
        
        // Update selected option
        const selectedOption = options.querySelector('.selected');
        if (selectedOption) selectedOption.classList.remove('selected');
        customOption.classList.add('selected');
        
        // Close dropdown
        options.classList.remove('open');
        
        // Trigger change event on the original select
        const event = new Event('change');
        select.dispatchEvent(event);
      });
      
      options.appendChild(customOption);
    });
    
    // Toggle dropdown on trigger click
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      
      // Close all other open dropdowns first
      document.querySelectorAll('.custom-options.open').forEach(openOptions => {
        if (openOptions !== options) {
          openOptions.classList.remove('open');
        }
      });
      
      // Toggle this dropdown
      options.classList.toggle('open');
    });
  });
  
  // Close all dropdowns when clicking outside
  document.addEventListener('click', () => {
    const openOptions = document.querySelectorAll('.custom-options.open');
    openOptions.forEach(o => o.classList.remove('open'));
  });
  
  console.log('Custom dropdowns initialized');
}

// Update save button state based on editor content
function updateSaveButtonState() {
  const saveBtn = document.getElementById('saveBtn');
  if (!saveBtn || !editor) return;
  
  const content = editor.getHTML();
  const textContent = stripHtml(content);
  const hasContent = textContent.trim().length > 0;
  
  //saveBtn.disabled = !hasContent;
  saveBtn.classList.toggle('disabled', !hasContent);
  // Update visual state
  if (hasContent) {
    saveBtn.classList.remove('disabled');
  } else {
    saveBtn.classList.add('disabled');
  }
}

// Handle SAVE button click - saves the current editor content
function handleSaveButtonClick() {
  if (!editor) {
    console.error('Editor not initialized');
    return;
  }
  
  // Get the current content from the editor
  const content = editor.getHTML();
  const textContent = stripHtml(content);
  
  if (!textContent.trim()) {
    // This shouldn't happen since button should be disabled, but just in case
    console.warn('Save button clicked but editor is empty');
    return;
  }
  
  // Create a filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `vibewriter-${timestamp}.txt`;
  
  // Create a blob with the text content
  const blob = new Blob([textContent], { type: 'text/plain' });
  
  // Create a download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  
  // Trigger the download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
  
  console.log(`Content saved as ${filename}`);
}

// Function to count words in text
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Add console logging for word count matching
function logToConsole(message, type = 'info') {
  const consoleMessages = document.getElementById('console-messages');
  if (consoleMessages) {
    const messageElement = document.createElement('div');
    messageElement.className = `console-message ${type}`;
    messageElement.textContent = message;
    consoleMessages.appendChild(messageElement);
    consoleMessages.scrollTop = consoleMessages.scrollHeight;
  }
}

// Call this function after the page loads
// document.addEventListener('DOMContentLoaded', () => {
  // });

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', initializeApp);
// End of file - no more code should be here
