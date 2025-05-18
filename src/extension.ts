// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';

const TUTOR_PROMPT =
'You are a helpful code tutor. Your job is to teach the user with simple descriptions and sample code of the concept. Respond with a guided overview of the concept in a series of messages. Do not give the user the answer directly, but guide them to find the answer themselves. If the user asks a non-programming question, politely decline to respond.';

const EXERCISES_PROMPT =
'You are a helpful tutor. Your job is to teach the user with fun, simple exercises that they can complete in the editor. Your exercises should start simple and get more complex as the user progresses. Move one concept at a time, and do not move on to the next concept until the user provides the correct answer. Give hints in your exercises to help the user learn. If the user is stuck, you can provide the answer and explain why it is the answer. If the user asks a non-programming question, politely decline to respond.';


const SUGGESTION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;



function getChatWebviewContent() {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Chat</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.8.0/styles/vs2015.min.css">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
    <script>
      // Ensure highlight.js is loaded
      window.onload = function() {
        if (typeof hljs !== 'undefined') {
          hljs.highlightAll();
        }
      };
    </script>
    <style>
      body {
        font-family: var(--vscode-font-family);
        padding: 0;
        margin: 0;
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      #header {
        display: flex;
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      #new-chat-button {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 8px;
        cursor: pointer;
      }
      #chat-container {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      .message {
        margin-bottom: 10px;
        padding: 8px 12px;
        border-radius: 6px;
        max-width: 80%;
      }
      .user-message {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        align-self: flex-end;
      }
      .assistant-message {
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        color: var(--vscode-editor-foreground);
        align-self: flex-start;
      }
      /* Markdown styling */
      .markdown-content {
        line-height: 1.5;
      }
      .markdown-content p {
        margin: 0.5em 0;
      }
      .markdown-content pre {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 3px;
        padding: 8px;
        overflow-x: auto;
        margin: 0.5em 0;
      }
      .markdown-content code {
        font-family: var(--vscode-editor-font-family);
        background-color: var(--vscode-editor-background);
        padding: 2px 4px;
        border-radius: 3px;
      }
      .markdown-content pre code {
        padding: 0;
        background-color: transparent;
        border-radius: 0;
        font-size: 0.9em;
        line-height: 1.4;
      }
      .markdown-content blockquote {
        border-left: 3px solid var(--vscode-panel-border);
        margin-left: 0;
        padding-left: 10px;
        color: var(--vscode-descriptionForeground);
      }
      .markdown-content ul, .markdown-content ol {
        padding-left: 20px;
      }
      #input-container {
        display: flex;
        padding: 10px;
        border-top: 1px solid var(--vscode-panel-border);
        position: relative;
      }
      #message-input {
        flex: 1;
        padding: 8px;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 4px;
      }
      #send-button {
        margin-left: 10px;
        padding: 8px 16px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      #file-search-results {
        position: absolute;
        bottom: 100%;
        left: 0;
        width: 100%;
        max-height: 200px;
        overflow-y: auto;
        background-color: var(--vscode-dropdown-background);
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 4px;
        z-index: 10;
        display: none;
      }
      .file-result {
        padding: 8px;
        cursor: pointer;
        border-bottom: 1px solid var(--vscode-dropdown-border);
      }
      .file-result:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .file-result.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
      }
    </style>
  </head>
  <body>
    <div id="header">
      <button id="new-chat-button">New Chat</button>
      <select id="chat-selector" style="margin-left: 10px; padding: 4px; background-color: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border);">
        <option value="">Select a chat</option>
      </select>
      <button id="rename-chat-button" style="margin-left: 10px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; cursor: pointer;">Rename</button>
      <button id="delete-chat-button" style="margin-left: 10px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 8px; cursor: pointer;">Delete</button>
    </div>
    <div id="chat-container"></div>
    <div id="input-container">
      <input type="text" id="message-input" placeholder="Type your message...">
      <button id="send-button">Send</button>
      <div id="file-search-results"></div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const chatContainer = document.getElementById('chat-container');
      const messageInput = document.getElementById('message-input');
      const sendButton = document.getElementById('send-button');
      const newChatButton = document.getElementById('new-chat-button');
      const chatSelector = document.getElementById('chat-selector');
      const renameChatButton = document.getElementById('rename-chat-button');
      const deleteChatButton = document.getElementById('delete-chat-button');
      const fileSearchResults = document.getElementById('file-search-results');

      // Current chat state
      let currentChatId = '';
      let selectedFile = null;
      let fileContent = null;

      // Configure marked
      try {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
      } catch (e) {
        console.error('Error configuring marked:', e);
      }

      // Function to add a message to the chat
      function addMessage(text, isUser) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(isUser ? 'user-message' : 'assistant-message');

        if (isUser) {
          messageElement.textContent = text;
        } else {
          // Parse markdown for assistant messages
          const markdownDiv = document.createElement('div');
          markdownDiv.classList.add('markdown-content');
          markdownDiv.innerHTML = marked.parse(text);

          // Apply syntax highlighting to any code blocks
          try {
            markdownDiv.querySelectorAll('pre code').forEach((block) => {
              hljs.highlightElement(block);
            });
          } catch (e) {
            console.log('Highlight.js not loaded yet:', e);
          }

          messageElement.appendChild(markdownDiv);
        }

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }

      // Function to load chat messages
      function loadChatMessages(messages) {
        chatContainer.innerHTML = '';
        if (messages && messages.length > 0) {
          messages.forEach(message => {
            addMessage(message.content, message.role === 'user');
          });
        }
      }

      // Function to update chat sessions dropdown
      function updateChatSessions(sessions) {
        // Clear existing options except the first one
        while (chatSelector.options.length > 1) {
          chatSelector.remove(1);
        }

        // Add new options
        sessions.forEach(session => {
          const option = document.createElement('option');
          option.value = session.id;
          option.text = session.name;
          // Store the full session data as a data attribute
          option.dataset.created = session.created_at;
          chatSelector.appendChild(option);
        });

        // Select current chat if it exists
        if (currentChatId) {
          chatSelector.value = currentChatId;

          // Update window title with chat name
          const selectedOption = Array.from(chatSelector.options).find(opt => opt.value === currentChatId);
          if (selectedOption) {
            // Set panel title if available
            try {
              document.title = 'Chat: ' + selectedOption.text;
            } catch (e) {
              console.error('Error setting title:', e);
            }
          }
        }
      }

      // Send message when button is clicked
      sendButton.addEventListener('click', () => {
        const text = messageInput.value.trim();
        if (text) {
          vscode.postMessage({
            command: 'sendMessage',
            text: text,
            chatId: currentChatId,
            fileContent: fileContent
          });
          messageInput.value = '';
          selectedFile = null;
          fileContent = null;
        }
      });

      // Handle input events for file search
      messageInput.addEventListener('input', (e) => {
        const text = e.target.value;

        // Check if we're in file search mode (starts with @)
        if (text.startsWith('@')) {
          const query = text.substring(1).trim();
          if (query.length > 0) {
            // Request file search
            vscode.postMessage({
              command: 'searchFiles',
              query: query
            });
          } else {
            // Hide results if query is empty
            fileSearchResults.style.display = 'none';
          }
        } else {
          // Hide results if not in file search mode
          fileSearchResults.style.display = 'none';
          selectedFile = null;
          fileContent = null;
        }
      });

      // Handle keyboard navigation in file search results
      messageInput.addEventListener('keydown', (e) => {
        if (fileSearchResults.style.display === 'block') {
          const results = fileSearchResults.querySelectorAll('.file-result');
          const currentIndex = Array.from(results).findIndex(el => el.classList.contains('selected'));

          switch (e.key) {
            case 'ArrowDown':
              e.preventDefault();
              if (currentIndex < results.length - 1) {
                if (currentIndex >= 0) results[currentIndex].classList.remove('selected');
                results[currentIndex + 1].classList.add('selected');
                results[currentIndex + 1].scrollIntoView({ block: 'nearest' });
              }
              break;
            case 'ArrowUp':
              e.preventDefault();
              if (currentIndex > 0) {
                results[currentIndex].classList.remove('selected');
                results[currentIndex - 1].classList.add('selected');
                results[currentIndex - 1].scrollIntoView({ block: 'nearest' });
              }
              break;
            case 'Enter':
              if (currentIndex >= 0) {
                e.preventDefault();
                results[currentIndex].click();
              }
              break;
            case 'Escape':
              e.preventDefault();
              fileSearchResults.style.display = 'none';
              break;
          }
        }
      });

      // Send message when Enter key is pressed
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.defaultPrevented) {
          sendButton.click();
        }
      });

      // Handle new chat button
      newChatButton.addEventListener('click', () => {
        // Clear the chat container immediately
        chatContainer.innerHTML = '';
        vscode.postMessage({
          command: 'newChat'
        });
      });

      // Handle chat selection
      chatSelector.addEventListener('change', () => {
        const selectedChatId = chatSelector.value;
        if (selectedChatId) {
          currentChatId = selectedChatId;

          // Update window title with selected chat name
          const selectedOption = chatSelector.options[chatSelector.selectedIndex];
          if (selectedOption) {
            try {
              document.title = 'Chat: ' + selectedOption.text;
            } catch (e) {
              console.error('Error setting title:', e);
            }
          }

          vscode.postMessage({
            command: 'selectChat',
            chatId: selectedChatId
          });
        }
      });

      // Handle rename chat button
      renameChatButton.addEventListener('click', () => {
        if (currentChatId) {
          // Get current chat name
          const selectedOption = chatSelector.options[chatSelector.selectedIndex];
          const currentName = selectedOption ? selectedOption.text : '';

          vscode.postMessage({
            command: 'renameChat',
            chatId: currentChatId,
            currentName: currentName
          });
        } else {
          vscode.postMessage({
            command: 'showMessage',
            text: 'Please select a chat to rename'
          });
        }
      });

      // Handle delete chat button
      deleteChatButton.addEventListener('click', () => {
        if (currentChatId) {
          // Clear the chat container immediately
          chatContainer.innerHTML = '';
          vscode.postMessage({
            command: 'deleteChat',
            chatId: currentChatId
          });
        } else {
          vscode.postMessage({
            command: 'showMessage',
            text: 'Please select a chat to delete'
          });
        }
      });

      // Function to handle file search results
      function displayFileSearchResults(files) {
        // Clear previous results
        fileSearchResults.innerHTML = '';

        if (files.length === 0) {
          fileSearchResults.style.display = 'none';
          return;
        }

        // Display up to 10 results
        const maxResults = Math.min(files.length, 10);
        for (let i = 0; i < maxResults; i++) {
          const file = files[i];
          const resultElement = document.createElement('div');
          resultElement.classList.add('file-result');
          resultElement.textContent = file.name;
          resultElement.title = file.fsPath;

          // Add click handler
          resultElement.addEventListener('click', () => {
            // Request file content
            vscode.postMessage({
              command: 'getFileContent',
              uri: file.uri
            });

            // Hide search results
            fileSearchResults.style.display = 'none';

            // Store selected file
            selectedFile = file;
          });

          fileSearchResults.appendChild(resultElement);
        }

        // Select first result
        if (fileSearchResults.firstChild) {
          fileSearchResults.firstChild.classList.add('selected');
        }

        // Show results
        fileSearchResults.style.display = 'block';
      }

      // Function to receive messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
          case 'receiveMessage':
            addMessage(message.text, message.isUser || false);
            break;
          case 'updateChatMessages':
            loadChatMessages(message.messages);
            break;
          case 'updateChatSessions':
            updateChatSessions(message.sessions);
            if (message.currentChatId) {
              currentChatId = message.currentChatId;
              chatSelector.value = currentChatId;
            }
            break;
          case 'setCurrentChat':
            currentChatId = message.chatId;
            chatSelector.value = currentChatId;
            break;
          case 'fileSearchResults':
            displayFileSearchResults(message.files);
            break;
          case 'fileContent':
            // Store file content
            fileContent = message.content;

            // Update input to show file name
            const currentText = messageInput.value;
            const atIndex = currentText.indexOf('@');
            if (atIndex !== -1) {
              // Replace the @query with the file name
              messageInput.value = currentText.substring(0, atIndex) + '@' + message.fileName + ' ';
              // Position cursor at the end
              messageInput.selectionStart = messageInput.selectionEnd = messageInput.value.length;
            }
            break;
        }
      });

      // Request initial data
      vscode.postMessage({
        command: 'initialize'
      });
    </script>
  </body>
  </html>`;
}


// Chat data structures
interface ChatSession {
  id: string;
  name: string;
  created_at: string;
}

interface SuggestionInfo {
  line: number;
  suggestion: string;
}

interface SuggestionList {
  suggestions: SuggestionInfo[];
}

interface ChatResponse {
  response: string;
}

interface AutoCompleteResponse {
  completion: string;
}

// Function to update the model in the Python backend
async function updateModelInBackend(model: string): Promise<boolean> {
  try {
    const response = await axios.post('http://localhost:8000/update_model', {
      model: model
    });

    console.log('Model updated in backend:', response.data);
    return true;
  } catch (error) {
    console.error('Error updating model in backend:', error);
    vscode.window.showErrorMessage(`Failed to update model: ${error}`);
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Current chat state
  let currentChatId: string = '';
  let chatSessions: ChatSession[] = [];

  // Chat panel reference
  let chatPanel: vscode.WebviewPanel | undefined = undefined;

  // Track active code suggestions
  let activeSuggestionDecorations: vscode.TextEditorDecorationType[] = [];

  // Get the current model from settings
  const config = vscode.workspace.getConfiguration('new-texty');
  const currentModel = config.get<string>('model') || 'qwen2.5:3b';

  // Update the model in the backend when the extension is activated
  updateModelInBackend(currentModel);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('new-texty.model')) {
        const newModel = vscode.workspace.getConfiguration('new-texty').get<string>('model') || 'qwen2.5:3b';
        console.log('Model setting changed to:', newModel);
        updateModelInBackend(newModel);
      }
    })
  );

  // Function to search for files in the workspace
  async function searchWorkspaceFiles(query: string, maxResults: number = 10): Promise<vscode.Uri[]> {
    if (!query) return [];

    // Create a glob pattern that searches for files with names containing the query
    const searchPattern = `**/*${query}*`;

    try {
      // Find files matching the pattern
      const files = await vscode.workspace.findFiles(searchPattern, '**/node_modules/**', maxResults);
      return files;
    } catch (error) {
      console.error('Error searching for files:', error);
      return [];
    }
  }

  // Function to read file content
  async function getFileContent(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      console.error(`Error reading file ${uri.fsPath}:`, error);
      return '';
    }
  }

  // Function to load chat sessions
  async function loadChatSessions() {
    try {
      const response = await axios.get('http://localhost:8000/chat_sessions');
      chatSessions = response.data.sessions;

      // Sort sessions by name for easier selection
      chatSessions.sort((a, b) => a.name.localeCompare(b.name));

      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: 'updateChatSessions',
          sessions: chatSessions,
          currentChatId: currentChatId
        });

        // Update panel title if we have a current chat
        if (currentChatId) {
          const currentSession = chatSessions.find(s => s.id === currentChatId);
          if (currentSession) {
            chatPanel.title = `Chat: ${currentSession.name}`;
          }
        }
      }

      return chatSessions;
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      return [];
    }
  }

  // Function to load chat messages
  async function loadChatMessages(chatId: string) {
    if (!chatId) return [];

    try {
      const response = await axios.get(`http://localhost:8000/chat_messages/${chatId}`);
      const messages = response.data.messages;

      // Find the chat session to get its name
      const session = chatSessions.find(s => s.id === chatId);
      if (session && chatPanel) {
        // Update the panel title with the chat name
        chatPanel.title = `Chat: ${session.name}`;
      }

      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: 'updateChatMessages',
          messages: messages
        });
      }

      return messages;
    } catch (error) {
      console.error(`Error loading messages for chat ${chatId}:`, error);
      return [];
    }
  }

  // Function to create a new chat session
  async function createNewChat() {
    try {
      // Prompt user for chat name
      const chatName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new chat',
        placeHolder: 'My Chat',
        validateInput: async (value) => {
          // Check if name already exists
          if (!value.trim()) {
            return 'Chat name cannot be empty';
          }

          // Check if name already exists in current sessions
          const existingNames = chatSessions.map(session => session.name.toLowerCase());
          if (existingNames.includes(value.trim().toLowerCase())) {
            return 'A chat with this name already exists';
          }

          return null; // Name is valid
        }
      });

      // If user cancelled, return empty string
      if (!chatName) {
        return '';
      }

      // Create new chat with the provided name
      const response = await axios.post('http://localhost:8000/create_chat_session', null, {
        params: { name: chatName.trim() }
      });

      currentChatId = response.data.session_id;

      // Reload chat sessions
      await loadChatSessions();

      // Set current chat and clear messages
      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: 'setCurrentChat',
          chatId: currentChatId
        });

        // Send empty messages to clear the chat
        chatPanel.webview.postMessage({
          command: 'updateChatMessages',
          messages: []
        });
      }

      return currentChatId;
    } catch (error) {
      console.error('Error creating new chat:', error);
      return '';
    }
  }

  // Function to delete a chat session
  async function deleteChat(chatId: string) {
    if (!chatId) return;

    try {
      await axios.delete(`http://localhost:8000/chat_session/${chatId}`);

      // Reload chat sessions
      const sessions = await loadChatSessions();

      // Select a new chat if available, otherwise create a new one
      if (sessions.length > 0) {
        currentChatId = sessions[0].id;
        await loadChatMessages(currentChatId);

        if (chatPanel) {
          chatPanel.webview.postMessage({
            command: 'setCurrentChat',
            chatId: currentChatId
          });
        }
      } else {
        await createNewChat();
      }
    } catch (error) {
      console.error(`Error deleting chat ${chatId}:`, error);
    }
  }

  // Function to rename a chat session
  async function renameChat(chatId: string, currentName: string) {
    if (!chatId) return;

    try {
      // Prompt user for new chat name
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter a new name for the chat',
        placeHolder: currentName,
        value: currentName,
        validateInput: async (value) => {
          // Check if name is valid
          if (!value.trim()) {
            return 'Chat name cannot be empty';
          }

          // Check if name already exists (excluding current chat)
          const existingNames = chatSessions
            .filter(session => session.id !== chatId)
            .map(session => session.name.toLowerCase());

          if (existingNames.includes(value.trim().toLowerCase())) {
            return 'A chat with this name already exists';
          }

          return null; // Name is valid
        }
      });

      // If user cancelled, return
      if (!newName) {
        return;
      }

      // Rename the chat
      await axios.post(`http://localhost:8000/rename_chat_session/${chatId}`, null, {
        params: { name: newName.trim() }
      });

      // Reload chat sessions
      await loadChatSessions();

      // Update panel title
      if (chatPanel) {
        chatPanel.title = `Chat: ${newName.trim()}`;
      }

    } catch (error) {
      console.error(`Error renaming chat ${chatId}:`, error);
      vscode.window.showErrorMessage(`Failed to rename chat: ${error}`);
    }
  }

  function createChatPanel(extensionUri: vscode.Uri) {
    // If we already have a panel, show it
    if (chatPanel) {
      chatPanel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    // Otherwise, create a new panel
    chatPanel = vscode.window.createWebviewPanel(
      'codeChat',
      'Code Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    // Set the HTML content
    chatPanel.webview.html = getChatWebviewContent();

    // Handle messages from the webview
    chatPanel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'initialize':
            // Load chat sessions
            await loadChatSessions();

            // Create a new chat if none exists
            if (chatSessions.length === 0) {
              await createNewChat();
            } else if (!currentChatId && chatSessions.length > 0) {
              currentChatId = chatSessions[0].id;

              // Set current chat
              chatPanel?.webview.postMessage({
                command: 'setCurrentChat',
                chatId: currentChatId
              });

              // Load messages for the current chat
              await loadChatMessages(currentChatId);
            }
            return;

          case 'sendMessage':
            await handleChatMessage(message.text, message.chatId, message.fileContent);
            return;

          case 'searchFiles':
            const files = await searchWorkspaceFiles(message.query);
            // Convert file URIs to more readable format with just the file name and path
            const fileResults = files.map(file => ({
              uri: file.toString(),
              fsPath: file.fsPath,
              name: file.fsPath.split('/').pop() || ''
            }));

            chatPanel?.webview.postMessage({
              command: 'fileSearchResults',
              files: fileResults
            });
            return;

          case 'getFileContent':
            try {
              const fileUri = vscode.Uri.parse(message.uri);
              const content = await getFileContent(fileUri);
              chatPanel?.webview.postMessage({
                command: 'fileContent',
                content,
                fileName: fileUri.fsPath.split('/').pop() || ''
              });
            } catch (error) {
              console.error('Error getting file content:', error);
              chatPanel?.webview.postMessage({
                command: 'showMessage',
                text: 'Error reading file content'
              });
            }
            return;

          case 'newChat':
            await createNewChat();
            return;

          case 'selectChat':
            currentChatId = message.chatId;
            await loadChatMessages(currentChatId);
            return;

          case 'deleteChat':
            // Show confirmation dialog
            const answer = await vscode.window.showWarningMessage(
              'Are you sure you want to delete this chat?',
              { modal: true },
              'Yes', 'No'
            );
            if (answer === 'Yes') {
              await deleteChat(message.chatId);
            } else {
              // Reload the current chat if deletion was cancelled
              await loadChatMessages(currentChatId);
            }
            return;

          case 'renameChat':
            await renameChat(message.chatId, message.currentName);
            return;

          case 'showMessage':
            vscode.window.showInformationMessage(message.text);
            return;
        }
      },
      undefined,
      context.subscriptions
    );

    // Reset when the panel is closed
    chatPanel.onDidDispose(
      () => {
        chatPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }

  // Function to handle chat messages
  async function handleChatMessage(text: string, chatId: string, fileContent?: string) {
    if (!chatPanel) return;

    // Use current chat ID if none provided
    if (!chatId && currentChatId) {
      chatId = currentChatId;
    }

    // Create a new chat if needed
    if (!chatId) {
      chatId = await createNewChat();
    }

    // Display user message in UI
    chatPanel.webview.postMessage({
      command: 'receiveMessage',
      text: text,
      isUser: true
    });

    try {
      // Prepare request data
      const requestData: any = {
        prompt: text,
        chat_id: chatId
      };

      // Add file content if provided
      if (fileContent) {
        requestData.context = fileContent;
      }

      // Send request to backend with chat ID and optional file content
      const response = await axios.post<ChatResponse>('http://localhost:8000/chat', requestData);

      // Send message to webview
      chatPanel.webview.postMessage({
        command: 'receiveMessage',
        text: response.data.response
      });

    } catch (error) {
      console.error('Error:', error);

      // Send error message to webview
      chatPanel.webview.postMessage({
        command: 'receiveMessage',
        text: 'Error connecting to model'
      });
    }
  }

  // Register the chat command
  const chatCommand = vscode.commands.registerCommand('new-texty.open_chat', () => {
    createChatPanel(context.extensionUri);
  });

  // Auto-complete decoration type
  let autoCompleteDecoration: vscode.TextEditorDecorationType | undefined;
  let currentCompletion: string | undefined;

  // Helper function to insert text at a position
  async function insertTextAtPosition(editor: vscode.TextEditor, position: vscode.Position, text: string): Promise<boolean> {
    try {
      // Try the edit method first
      const success = await editor.edit(editBuilder => {
        editBuilder.insert(position, text);
      });

      if (success) {
        return true;
      }

      // If that fails, try the insertText command
      try {
        await vscode.commands.executeCommand('editor.action.insertText', { text });
        return true;
      } catch (innerError) {
        // If both methods fail, try one more approach
        await vscode.commands.executeCommand('default:type', { text });
        return true;
      }
    } catch (error) {
      console.error('Error inserting text:', error);
      vscode.window.showErrorMessage(`Failed to insert text: ${error}`);
      return false;
    }
  }

  // Register the auto-complete command
  const autoCompleteCommand = vscode.commands.registerTextEditorCommand('new-texty.auto_complete', async(textEditor: vscode.TextEditor) => {
    // Get current position
    const position = textEditor.selection.active;
    const document = textEditor.document;
    const lineNumber = position.line;
    const characterPosition = position.character;

    // Get code context (current file content)
    const fileContent = document.getText();

    // Show status message to indicate we're getting a completion
    vscode.window.setStatusBarMessage('Getting AI suggestion...', 3000);

    try {
      // Get auto-completion from backend
      const response = await axios.post<AutoCompleteResponse>('http://localhost:8000/auto_complete', {
        code: fileContent,
        line_number: lineNumber,
        character_position: characterPosition
      });

      const completion = response.data.completion;
      if (!completion || completion.trim() === '') {
        vscode.window.setStatusBarMessage('No useful suggestion available', 1500);
        return;
      }

      // Store current completion
      currentCompletion = completion;

      // Clear previous decoration if exists
      if (autoCompleteDecoration) {
        autoCompleteDecoration.dispose();
      }

      // Create new decoration
      autoCompleteDecoration = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: completion,
          color: 'gray',
          fontStyle: 'italic'
        }
      });

      // Apply decoration at current position
      const range = new vscode.Range(position, position);
      textEditor.setDecorations(autoCompleteDecoration, [{ range }]);

      // Create a disposable for cleanup
      const disposables: vscode.Disposable[] = [];

      // Show status message to inform the user
      vscode.window.setStatusBarMessage('Press Tab to accept suggestion or Escape to cancel', 3000);

      // Create a command to accept the suggestion with Tab
      const acceptCommand = vscode.commands.registerCommand('new-texty.acceptSuggestion', async () => {
        if (currentCompletion && autoCompleteDecoration) {
          // Insert the completion text at cursor position
          const success = await insertTextAtPosition(textEditor, position, currentCompletion);

          if (success) {
            // Clear decoration
            autoCompleteDecoration.dispose();
            autoCompleteDecoration = undefined;
            currentCompletion = undefined;

            // Dispose all commands
            disposables.forEach(d => d.dispose());

            // Show confirmation
            vscode.window.setStatusBarMessage('Suggestion accepted', 1500);
          }
        }
      });
      disposables.push(acceptCommand);

      // Create a command to cancel the suggestion with Escape
      const cancelCommand = vscode.commands.registerCommand('new-texty.cancelSuggestion', () => {
        if (autoCompleteDecoration) {
          // Clear decoration
          autoCompleteDecoration.dispose();
          autoCompleteDecoration = undefined;
          currentCompletion = undefined;

          // Dispose all commands
          disposables.forEach(d => d.dispose());
        }
      });
      disposables.push(cancelCommand);

      // Register handler for Tab key via insertSnippet command
      const tabDisposable = vscode.commands.registerTextEditorCommand('editor.action.insertSnippet', (editor, _edit, args) => {
        // Only intercept when we have an active suggestion
        if (editor === textEditor && currentCompletion && autoCompleteDecoration) {
          // We have an active suggestion, accept it by inserting at cursor position
          insertTextAtPosition(editor, position, currentCompletion).then(success => {
            if (success) {
              // Clear decoration
              autoCompleteDecoration?.dispose();
              autoCompleteDecoration = undefined;
              currentCompletion = undefined;

              // Dispose all commands
              disposables.forEach(d => d.dispose());

              // Show confirmation
              vscode.window.setStatusBarMessage('Suggestion accepted', 1500);
            }
          });
          return;
        }

        // Otherwise, let the original command run (normal Tab behavior)
        return vscode.commands.executeCommand('default:editor.action.insertSnippet', args);
      });
      disposables.push(tabDisposable);

      // Register for selection changes to auto-cancel
      const selectionListener = vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === textEditor && currentCompletion && autoCompleteDecoration) {
          const currentPosition = textEditor.selection.active;
          if (currentPosition.line !== position.line || currentPosition.character !== position.character) {
            // Selection changed, cancel the suggestion
            vscode.commands.executeCommand('new-texty.cancelSuggestion');
          }
        }
      });
      disposables.push(selectionListener);

      // Status message already shown above

      // Register a direct key binding for Tab
      const tabKeyBinding = vscode.commands.registerCommand('type', (args) => {
        // Only intercept Tab key when we have an active suggestion
        if (args.text === '\t' && currentCompletion && autoCompleteDecoration) {
          // Tab was pressed with an active suggestion, accept it
          insertTextAtPosition(textEditor, position, currentCompletion).then(success => {
            if (success) {
              // Clear decoration
              autoCompleteDecoration?.dispose();
              autoCompleteDecoration = undefined;
              currentCompletion = undefined;

              // Dispose all commands
              disposables.forEach(d => d.dispose());

              // Show confirmation
              vscode.window.setStatusBarMessage('Suggestion accepted', 1500);
            }
          });

          return null; // Prevent default Tab behavior
        }

        // Handle Escape key to cancel suggestion
        if (args.text === '\u001B' && autoCompleteDecoration) {
          // Escape was pressed, cancel the suggestion
          vscode.commands.executeCommand('new-texty.cancelSuggestion');
          return null; // Prevent default Escape behavior
        }

        // For all other keys, allow default behavior
        return args;
      });
      disposables.push(tabKeyBinding);

      // Add all disposables to context subscriptions
      disposables.forEach(d => context.subscriptions.push(d));

    } catch (error) {
      console.error('Error getting auto-completion:', error);
      vscode.window.showErrorMessage('Failed to get auto-completion');
    }
  });

  // Register the code suggestion command
  const disposable = vscode.commands.registerTextEditorCommand('new-texty.code_suggestion', async(textEditor: vscode.TextEditor) => {
    // If we have active decorations, clear them (toggle off)
    if (activeSuggestionDecorations.length > 0) {
      // Dispose all active decorations
      activeSuggestionDecorations.forEach(decoration => decoration.dispose());
      // Clear the array
      activeSuggestionDecorations = [];
      vscode.window.showInformationMessage('Code suggestions cleared');
      return;
    }

    // Otherwise, get new suggestions (toggle on)
    const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

    try {
      const ollamaResponse = await getLLMResponse(codeWithLineNumbers);
      await parseOllamaResponse(ollamaResponse, textEditor, activeSuggestionDecorations);
      vscode.window.showInformationMessage('Code suggestions applied!');
    } catch(error) {
      console.error('Error getting suggestions:', error);
      vscode.window.showErrorMessage('Failed to get code suggestions');
    }
	});

  // We're not using the tab_completion command anymore
  // Instead, we'll use the Tab key to insert the current suggestion when available

	context.subscriptions.push(disposable);
  context.subscriptions.push(chatCommand);
  context.subscriptions.push(autoCompleteCommand);

  // Ensure we clean up any active decorations when the extension is deactivated
  context.subscriptions.push({
    dispose: () => {
      if (autoCompleteDecoration) {
        autoCompleteDecoration.dispose();
      }
      activeSuggestionDecorations.forEach(decoration => decoration.dispose());
    }
  });
}


async function getLLMResponse(prompt: string): Promise<{ response: SuggestionList }> {
	const response = await axios.post('http://localhost:8000/review_code', {
		"prompt": prompt,
	}, {
		headers: { 'Content-Type': 'application/json' }
	});

	console.log(response.data);

	return response.data;
}

// This function is for the code suggestion feature, not chat
async function parseOllamaResponse(
  response: { response: SuggestionList },
  textEditor: vscode.TextEditor,
  decorations: vscode.TextEditorDecorationType[]
) {
  response.response.suggestions.forEach(annotation => {
    if(annotation.line && annotation.suggestion){
      try {
        const decoration = applyDecoration(textEditor, annotation.line, annotation.suggestion);
        if (decoration) {
          decorations.push(decoration);
        }
      } catch(e) {
        console.log("Failed to add annotation", annotation, e);
      }
    }
  });
}


function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string): vscode.TextEditorDecorationType {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${suggestion.substring(0, 25) + '...'}`,
      color: 'grey'
    }
  });

  // get the end of the line with the specified line number
  const lineLength = editor.document.lineAt(line - 1).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength)
  );

  const decoration = { range: range, hoverMessage: suggestion };

  vscode.window.activeTextEditor?.setDecorations(decorationType, [decoration]);

  // Return the decoration type so it can be disposed later
  return decorationType;
}


function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {
  // get the position of the first and last visible lines
  let currentLine = textEditor.visibleRanges[0].start.line;
  const endLine = textEditor.visibleRanges[0].end.line;

  let code = '';

  // get the text from the line at the current position.
  // The line number is 0-based, so we add 1 to it to make it 1-based.
  while (currentLine < endLine) {
    code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
    // move to the next line position
    currentLine++;
  }
  return code;
}


export function deactivate() {
  // Cleanup is handled by the disposables in the activate function
}
