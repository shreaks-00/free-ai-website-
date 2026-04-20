// Application State
const state = {
    currentTool: 'chat',
    currentModel: 'openrouter/free',
    credits: 200,
    maxCredits: 500,
    openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
    databaseUrl: import.meta.env.VITE_DATABASE_URL || '', 
    userId: 'user_' + Math.random().toString(36).substr(2, 9),
    allFreeModels: [], // Cached list for dynamic filtering
    pendingImage: null, // Stores base64 of the uploaded image
    messages: {
        chat: [],
        roleplay: [],
        image: []
    },
};

// DOM Elements
const elements = {
    chatWindow: document.getElementById('chat-window'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    toolBtns: document.querySelectorAll('.tool-btn'),
    currentToolName: document.getElementById('current-tool-name'),
    modelSelect: document.getElementById('model-select'),
    // Custom dropdown UI
    selectTrigger: document.getElementById('model-select-trigger'),
    selectLabel: document.getElementById('model-select-label'),
    selectDropdown: document.getElementById('model-select-dropdown'),
    tokenCount: document.getElementById('token-count'),
    newChatBtn: document.getElementById('new-chat'),
    clearChatBtn: document.getElementById('clear-chat'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebarLeft: document.getElementById('sidebar-left'),
    sidebarRight: document.getElementById('sidebar-right'),
    progressBar: document.querySelector('.progress'),
    creditValue: document.querySelector('.value'),
    imageUpload: document.getElementById('image-upload'),
    uploadBtn: document.getElementById('upload-btn'),
    imagePreviewArea: document.getElementById('image-preview-area'),
    inputWrapper: document.querySelector('.input-wrapper'),
    dropOverlay: document.getElementById('drop-overlay'),
    pricingModal: document.getElementById('pricing-modal'),
    closeModalBtn: document.getElementById('close-modal'),
    upgradeBtn: document.querySelector('.upgrade-btn'),
    continueFreeBtn: document.getElementById('continue-free'),
    getUnlimitedBtn: document.getElementById('get-unlimited')
};

// Initialize App
function init() {
    // Event Listeners
    elements.sendBtn.addEventListener('click', handleSend);
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    elements.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTool(btn.dataset.tool));
    });

    elements.modelSelect.addEventListener('change', (e) => {
        state.currentModel = e.target.value;
    });

    elements.chatInput.addEventListener('input', autoResizeInput);

    elements.newChatBtn.addEventListener('click', createNewChat);
    elements.clearChatBtn.addEventListener('click', clearAllChats);

    // Custom Dropdown Toggle Logic
    if (elements.selectTrigger) {
        elements.selectTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = elements.selectDropdown.classList.contains('open');
            closeCustomDropdown();
            if (!isOpen) {
                // Position the fixed dropdown relative to the trigger
                const rect = elements.selectTrigger.getBoundingClientRect();
                elements.selectDropdown.style.top = (rect.bottom + 4) + 'px';
                elements.selectDropdown.style.left = rect.left + 'px';
                elements.selectDropdown.style.width = rect.width + 'px';
                elements.selectDropdown.classList.add('open');
                elements.selectTrigger.classList.add('open');
            }
        });
        document.addEventListener('click', () => closeCustomDropdown());
        elements.selectDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    if (elements.menuToggle) {
        elements.menuToggle.addEventListener('click', toggleMobileMenu);
    }

    // Image Upload Events
    elements.uploadBtn.addEventListener('click', () => elements.imageUpload.click());
    elements.imageUpload.addEventListener('change', handleFileSelect);

    // Global Drag and Drop
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropOverlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
        // Only hide if we actually leave the window
        if (e.relatedTarget === null) {
            elements.dropOverlay.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropOverlay.classList.remove('active');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    });

    // Allow clicking the credit values on mobile to see the right sidebar
    elements.creditValue.parentNode.addEventListener('click', () => {
        if (window.innerWidth <= 1024) toggleRightSidebar();
    });

    // Initial Load
    loadMessages('chat');
    fetchFreeModels();
    
    // Pricing Modal Setup
    initPricingModal();
}

function initPricingModal() {
    if (elements.upgradeBtn) {
        elements.upgradeBtn.addEventListener('click', () => {
            elements.pricingModal.classList.add('active');
        });
    }

    if (elements.closeModalBtn) {
        elements.closeModalBtn.addEventListener('click', () => {
            elements.pricingModal.classList.remove('active');
        });
    }

    if (elements.continueFreeBtn) {
        elements.continueFreeBtn.addEventListener('click', () => {
            elements.pricingModal.classList.remove('active');
            sessionStorage.setItem('pricingShown', 'true');
        });
    }

    if (elements.getUnlimitedBtn) {
        elements.getUnlimitedBtn.addEventListener('click', () => {
            alert("Checkout system coming soon! You will be able to upgrade to Pro for $1.");
        });
    }

    // Auto-show on first load in session
    if (!sessionStorage.getItem('pricingShown')) {
        setTimeout(() => {
            elements.pricingModal.classList.add('active');
        }, 1500); // Slight delay for effect
    }
}

// Fetch and Cache Free Models
async function fetchFreeModels() {
    try {
        elements.modelSelect.innerHTML = '<option value="openrouter/free">Loading free models...</option>';

        const response = await fetch("https://openrouter.ai/api/v1/models");
        const json = await response.json();

        // Filter for free models and cache them
        state.allFreeModels = json.data.filter(model =>
            model.pricing && model.pricing.prompt === "0" && model.pricing.completion === "0"
        );

        // Populate the model dropdown
        updateModelDropdown(state.currentTool);

    } catch (err) {
        console.warn("Failed to fetch dynamic models, using fallback.", err);
        state.allFreeModels = [
            { id: 'openrouter/free', name: 'Auto Free Model', architecture: { input_modalities: ['text'] } },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', architecture: { input_modalities: ['text'] } }
        ];
        updateModelDropdown(state.currentTool);
    }
}

// Close the custom dropdown
function closeCustomDropdown() {
    if (elements.selectDropdown) {
        elements.selectDropdown.classList.remove('open');
        elements.selectTrigger.classList.remove('open');
    }
}

// Populate Dropdown based on Tool Capabilities
function updateModelDropdown(toolId) {
    if (!elements.selectDropdown) return;
    elements.selectDropdown.innerHTML = '';

    // 1. Logic Helpers
    const isVision = (m) => m.architecture?.input_modalities?.includes('image') ||
        m.id.toLowerCase().includes('vision') ||
        m.name?.toLowerCase().includes('vision');

    const isUncensored = (id) => id.includes('llama') || id.includes('mistral') ||
        id.includes('myth') || id.includes('uncensored') ||
        id.includes('unfiltered') || id.includes('toppy');

    const isFast = (id, name) => id.includes('phi') || id.includes('tiny') ||
        id.includes('mini') || id.includes('7b') || id.includes('8b') || 
        id.includes('flash') || name.toLowerCase().includes('fast');

    const isAdvanced = (id, name) => id.includes('70b') || id.includes('40b') ||
        id.includes('large') || id.includes('liquid') ||
        id.includes('gemini') || id.includes('pro');

    const isRoleplay = (id) => id.includes('myth') || id.includes('story') || id.includes('rp') || id.includes('roleplay');

    // 2. Filter Models - STRICT ORGANIZATION
    const visionModels = state.allFreeModels.filter(isVision);
    const unfilteredModels = state.allFreeModels.filter(m => isUncensored(m.id.toLowerCase()) && !isVision(m));
    const rpModels = state.allFreeModels.filter(m => isRoleplay(m.id.toLowerCase()) && !isVision(m));
    const fastModels = state.allFreeModels.filter(m => isFast(m.id.toLowerCase(), (m.name || '').toLowerCase()) && !isVision(m));
    const advancedModels = state.allFreeModels.filter(m => isAdvanced(m.id.toLowerCase(), (m.name || '').toLowerCase()) && !isVision(m));

    // 3. Define Tool-Specific Visible Groups
    const groups = {
        '⭐ Recommended': [
            'openrouter/free',
            'meta-llama/llama-3.1-8b-instruct:free',
            'mistralai/mistral-7b-instruct:free',
            'microsoft/phi-3-mini-128k-instruct:free'
        ],
        '🔓 Unfiltered AI (Strictly Uncensored)': [],
        '⚡ Fast & Lightning Speed': [],
        '🧠 Big Brain (Advanced logic)': [],
        '🎭 RP & Storytelling Specialists': [],
        '👁️ Visual Intelligence (Image Support)': [],
        '🌐 General Purpose': []
    };

    if (toolId === 'image') {
        visionModels.forEach(m => groups['👁️ Visual Intelligence (Image Support)'].push({ id: m.id, name: m.name || m.id }));
        // Remove ALL other groups to satisfy "only show models the user current in" (strict filtering)
        Object.keys(groups).forEach(key => { if (key !== '👁️ Visual Intelligence (Image Support)' && key !== '⭐ Recommended') delete groups[key]; });
    } else if (toolId === 'roleplay') {
        rpModels.forEach(m => groups['🎭 RP & Storytelling Specialists'].push({ id: m.id, name: m.name || m.id }));
        unfilteredModels.forEach(m => groups['🔓 Unfiltered AI (Strictly Uncensored)'].push({ id: m.id, name: m.name || m.id }));
        // Only show relevant groups
        Object.keys(groups).forEach(key => { if (key !== '🎭 RP & Storytelling Specialists' && key !== '🔓 Unfiltered AI (Strictly Uncensored)' && key !== '⭐ Recommended') delete groups[key]; });
    } else {
        // Default Chat / Unfiltered Tool
        unfilteredModels.forEach(m => groups['🔓 Unfiltered AI (Strictly Uncensored)'].push({ id: m.id, name: m.name || m.id }));
        fastModels.forEach(m => groups['⚡ Fast & Lightning Speed'].push({ id: m.id, name: m.name || m.id }));
        advancedModels.forEach(m => groups['🧠 Big Brain (Advanced logic)'].push({ id: m.id, name: m.name || m.id }));
        // Hide specialized vision and core RP unless they fit Unfiltered
        delete groups['👁️ Visual Intelligence (Image Support)'];
        delete groups['🎭 RP & Storytelling Specialists'];
    }

    // 4. Render into custom dropdown
    for (const [groupName, models] of Object.entries(groups)) {
        if (models.length === 0) continue;

        const label = document.createElement('div');
        label.className = 'select-group-label';
        label.textContent = groupName;
        elements.selectDropdown.appendChild(label);

        models.forEach(m => {
            const id = typeof m === 'string' ? m : m.id;
            let name = typeof m === 'string' ? '' : m.name;

            // Resolve name for recommended string IDs
            if (typeof m === 'string') {
                if (id === 'openrouter/free') name = 'Auto Free Model (Smart Selection)';
                else {
                    const match = state.allFreeModels.find(found => found.id === id);
                    name = match ? match.name : id.split('/').pop().replace(/:free$/, '').toUpperCase();
                }
            }

            const opt = document.createElement('div');
            opt.className = 'select-option';
            if (isFast(id, (name || '').toLowerCase())) opt.classList.add('fast');
            opt.dataset.value = id;
            opt.textContent = name;
            if (id === state.currentModel) opt.classList.add('selected');

            opt.addEventListener('click', () => {
                state.currentModel = id;
                if (elements.selectLabel) elements.selectLabel.textContent = name;
                // Update selected visual
                elements.selectDropdown.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                closeCustomDropdown();
            });

            elements.selectDropdown.appendChild(opt);
        });
    }

    // Update trigger label to show current selection
    const currentOpt = elements.selectDropdown.querySelector(`[data-value="${state.currentModel}"]`);
    if (elements.selectLabel) {
        elements.selectLabel.textContent = currentOpt ? currentOpt.textContent : 'Auto Free Model (Smart Selection)';
    }
}

// UI Handlers
function switchTool(toolId) {
    state.currentTool = toolId;

    // Update active class
    elements.toolBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === toolId);
    });

    // Update Model Dropdown for this tool
    updateModelDropdown(toolId);

    // Update Header
    const toolNames = {
        chat: 'Uncensored Chat',
        roleplay: 'Roleplay AI',
        image: 'Image Analysis'
    };
    elements.currentToolName.textContent = toolNames[toolId];

    // Switch character placeholder
    elements.chatInput.placeholder = toolId === 'image' ? "Upload or describe an image..." : "Ask anything... (no restrictions)";

    loadMessages(toolId);
}

function autoResizeInput() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    elements.tokenCount.textContent = `${Math.ceil(this.value.length / 4)} tokens`;
}

function toggleMobileMenu() {
    elements.sidebarLeft.classList.toggle('open');
    elements.sidebarRight.classList.remove('open');
}

// Add a simple way to toggle right sidebar too if needed
function toggleRightSidebar() {
    elements.sidebarRight.classList.toggle('open');
    elements.sidebarLeft.classList.remove('open');
}

// Close sidebars on resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
        elements.sidebarLeft.classList.remove('open');
        elements.sidebarRight.classList.remove('open');
    }
});

// Chat Logic
async function handleSend() {
    const content = elements.chatInput.value.trim();
    if ((!content && !state.pendingImage) || state.credits <= 0) return;

    // 1. Add User Message (Handle Multimodal)
    const userMsgDiv = addMessage('user', content || (state.pendingImage ? "[Image Attached]" : ""));
    if (state.pendingImage) {
        const img = document.createElement('img');
        img.src = state.pendingImage;
        img.style.maxWidth = '200px';
        img.style.borderRadius = '10px';
        img.style.display = 'block';
        img.style.marginTop = '10px';
        userMsgDiv.querySelector('.content').appendChild(img);
    }

    // Clear input and previews
    const sentImage = state.pendingImage; // Cache for API call
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    elements.imagePreviewArea.innerHTML = '';
    state.pendingImage = null;

    // 2. Update Credits
    updateCredits(sentImage ? -15 : -5);

    // 3. Show AI Typing
    const typingMessage = addMessage('ai', '...', true);

    // 4. Call API with Streaming
    try {
        let fullResponse = "";
        const onChunk = (chunk) => {
            fullResponse += chunk;
            updateMessage(typingMessage, fullResponse);
        };

        const finalResponse = await callOpenRouter(content, sentImage, onChunk);
        updateMessage(typingMessage, finalResponse, true);

        // 5. Log to Database
        logToDatabase('LOG_CHAT', {
            role: 'user',
            content: content,
            model: state.currentModel
        });
        logToDatabase('LOG_CHAT', {
            role: 'ai',
            content: finalResponse,
            model: state.currentModel
        });
        logToDatabase('UPDATE_LIMIT', {
            usageCount: state.credits
        });

    } catch (error) {
        let errorMsg = "⚠️ **Model Timeout / Busy**: This model is taking too long to respond. Please try a different model (like **Llama 3 8B** or **Phi-3**) which are usually faster.";
        
        if (error.message?.includes('429')) {
             errorMsg = "⚠️ **Rate Limit Hit**: You've reached the free limit for this specific model. Switch to another 'Free' model in the list to continue immediately!";
        }
        
        updateMessage(typingMessage, errorMsg, true);
        console.error("API Error:", error);
    }
}

function addMessage(role, content, isTyping = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message ${isTyping ? 'typing' : ''}`;
    const innerContent = isTyping ? '<div class="ai-loader-container"><div class="loader"></div></div>' : `<p>${content}</p>`;
    msgDiv.innerHTML = `
        <div class="avatar">${role === 'ai' ? 'AI' : 'U'}</div>
        <div class="content">
            ${innerContent}
        </div>
    `;
    elements.chatWindow.appendChild(msgDiv);
    elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;

    // Save to state
    if (!isTyping) {
        state.messages[state.currentTool].push({ role, content });
    }

    return msgDiv;
}

function updateMessage(msgElement, newContent, isDone = false) {
    let contentDiv = msgElement.querySelector('.content p');
    
    // If we are currently showing the loader, replace it with a p tag
    if (!contentDiv) {
        const container = msgElement.querySelector('.content');
        container.innerHTML = `<p class="streaming"></p>`;
        contentDiv = container.querySelector('p');
    }

    contentDiv.innerHTML = newContent.replace(/\n/g, '<br>');
    
    if (isDone) {
        msgElement.classList.remove('typing');
        contentDiv.classList.remove('streaming');
        // Save to state only when done
        state.messages[state.currentTool].push({ role: 'ai', content: newContent });
    }
    
    elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

function loadMessages(toolId) {
    elements.chatWindow.innerHTML = '';

    // 1. Add tool-specific welcome message (UI only, don't save to state)
    const welcomeMessages = {
        chat: "Welcome to the **Uncensored AI Suite**. What's on your mind?",
        roleplay: "I am ready for any character or scenario. Who shall I be today?",
        image: "Upload an image and I'll analyze every detail without filters."
    };

    // Create UI for welcome message manually to avoid saving to state
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = `message ai-message`;
    welcomeDiv.innerHTML = `
        <div class="avatar">AI</div>
        <div class="content"><p>${welcomeMessages[toolId]}</p></div>
    `;
    elements.chatWindow.appendChild(welcomeDiv);

    // 2. Load actual conversation history from state
    state.messages[toolId].forEach(msg => {
        // Create manual message UI to avoid re-saving
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role}-message`;
        msgDiv.innerHTML = `
            <div class="avatar">${msg.role === 'ai' ? 'AI' : 'U'}</div>
            <div class="content"><p>${msg.content.replace(/\n/g, '<br>')}</p></div>
        `;
        elements.chatWindow.appendChild(msgDiv);
    });

    elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

function createNewChat() {
    state.messages[state.currentTool] = [];
    loadMessages(state.currentTool);
}

function clearAllChats() {
    state.messages = { chat: [], roleplay: [], image: [] };
    loadMessages(state.currentTool);
}

// API Integration
async function callOpenRouter(prompt, imageBase64 = null, onChunk = null) {
    if (!state.openRouterApiKey) return "Please configure the OpenRouter API key.";

    const contentParts = [];
    if (prompt) contentParts.push({ type: "text", text: prompt });
    if (imageBase64) {
        contentParts.push({
            type: "image_url",
            image_url: { url: imageBase64 }
        });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${state.openRouterApiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://annochat.ai",
                "X-Title": "AnnoChat Uncensored"
            },
            signal: controller.signal,
            body: JSON.stringify({
                "model": state.currentModel,
                "stream": true, // Enable streaming
                "messages": [{ "role": "user", "content": contentParts }]
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 429) throw new Error('429');
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error?.message || `Status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') break;
                    try {
                        const data = JSON.parse(dataStr);
                        const content = data.choices[0]?.delta?.content || "";
                        if (content) {
                            fullContent += content;
                            if (onChunk) onChunk(content);
                        }
                    } catch (e) {}
                }
            }
        }

        return fullContent || "No response content.";
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('Timeout');
        throw err;
    }
}

// Database Integration
async function logToDatabase(action, payload) {
    if (!state.databaseUrl) return;

    try {
        await fetch(state.databaseUrl, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requires no-cors if not handling preflight perfectly
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: action,
                userId: state.userId,
                timestamp: new Date().toISOString(),
                ...payload
            })
        });
    } catch (err) {
        console.warn("Database logging failed. Ensure the Apps Script is deployed as a Web App.", err);
    }
}

function updateCredits(amount) {
    state.credits = Math.max(0, state.credits + amount);
    elements.creditValue.textContent = `${state.credits} / ${state.maxCredits}`;
    const percentage = (state.credits / state.maxCredits) * 100;
    elements.progressBar.style.width = `${percentage}%`;
}

// Image Handling Logic
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processImage(file);
}

function processImage(file) {
    if (file.size > 5 * 1024 * 1024) return alert("Image too large. Please use images under 5MB.");

    const reader = new FileReader();
    reader.onload = (e) => {
        state.pendingImage = e.target.result;
        renderImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
}

function renderImagePreview(src) {
    elements.imagePreviewArea.innerHTML = `
        <div class="preview-capsule">
            <img src="${src}" alt="preview">
            <button class="remove-preview" onclick="removeImage()">×</button>
        </div>
    `;
}

function removeImage() {
    state.pendingImage = null;
    elements.imagePreviewArea.innerHTML = '';
    elements.imageUpload.value = '';
}

// Global Model Directory Renderer
function renderModelDirectory() {
    elements.modelDirectoryList.innerHTML = '';

    if (state.allFreeModels.length === 0) {
        elements.modelDirectoryList.innerHTML = '<p class="empty-text">No models available.</p>';
        return;
    }

    state.allFreeModels.forEach(m => {
        const row = document.createElement('div');
        row.className = 'model-item-row';

        // Determine Tag
        let tag = "Text";
        if (m.architecture?.input_modalities?.includes('image')) tag = "Vision";
        if (m.id.toLowerCase().includes('llama')) tag = "Llama";

        row.innerHTML = `
            <span class="model-name" title="${m.id}">${m.name || m.id}</span>
            <span class="model-tag">${tag}</span>
        `;
        elements.modelDirectoryList.appendChild(row);
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);
