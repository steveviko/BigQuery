// State Management
let allNotes = [];
let selectedNoteIds = new Set();
let activeFilter = 'all';
let searchQuery = '';
let lastUpdatedTime = '';

// DOM Elements
const notesGrid = document.getElementById('notes-grid');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh-btn');
const retryBtn = document.getElementById('retry-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const filterChipsContainer = document.getElementById('filter-chips-container');
const lastUpdatedText = document.getElementById('last-updated-text');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// System Stats DOM Elements
const dbTotalCount = document.getElementById('db-total-count');
const emailStatusIcon = document.getElementById('email-status-icon');
const emailConfigStatus = document.getElementById('email-config-status');
const testEmailBtn = document.getElementById('test-email-btn');

// Floating Dock Elements
const floatingShareDock = document.getElementById('floating-share-dock');
const dockSelectedCount = document.getElementById('dock-selected-count');
const openComposerBtn = document.getElementById('open-composer-btn');

// Modal Elements
const composerModal = document.getElementById('composer-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const btnCancel = document.getElementById('btn-cancel');
const tweetTextarea = document.getElementById('tweet-textarea');
const tweetPreviewText = document.getElementById('tweet-preview-text');
const charCountText = document.getElementById('char-count-text');
const progressRingFill = document.getElementById('progress-ring-fill');
const btnTweetNow = document.getElementById('btn-tweet-now');

// Helper Buttons
const btnHelperSummary = document.getElementById('btn-helper-summary');
const btnHelperTags = document.getElementById('btn-helper-tags');
const btnHelperReset = document.getElementById('btn-helper-reset');

// Circular Progress Ring Math
const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~87.96
const TWEET_LIMIT = 280;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchNotes();
    setupEventListeners();
    initProgressRing();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh feed
    refreshBtn.addEventListener('click', () => fetchNotes(true));
    retryBtn.addEventListener('click', () => fetchNotes(true));
    
    // Search
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
    clearFiltersBtn.addEventListener('click', resetAllFilters);
    
    // Filter Chips
    filterChipsContainer.addEventListener('click', handleFilterClick);
    
    // Selection Dock
    openComposerBtn.addEventListener('click', openComposer);
    
    // Modal Actions
    closeModalBtn.addEventListener('click', closeComposer);
    btnCancel.addEventListener('click', closeComposer);
    composerModal.addEventListener('click', (e) => {
        if (e.target === composerModal) closeComposer();
    });
    
    // Composer Live Update
    tweetTextarea.addEventListener('input', handleComposerInput);
    
    // Helpers
    btnHelperSummary.addEventListener('click', autoSummarizeTweet);
    btnHelperTags.addEventListener('click', toggleHashtags);
    btnHelperReset.addEventListener('click', resetTweetText);
    
    // Post to X
    btnTweetNow.addEventListener('click', publishTweet);
    
    // Test Email Action
    if (testEmailBtn) {
        testEmailBtn.addEventListener('click', sendTestEmail);
    }
}

// Fetch notes from Flask API
async function fetchNotes(bypassCache = false) {
    showState('loading');
    selectedNoteIds.clear();
    updateFloatingDock();
    
    // Set refreshing state on header button
    refreshBtn.classList.add('refreshing');
    const refreshIcon = refreshBtn.querySelector('i');
    if (refreshIcon) refreshIcon.style.animation = 'rotate 1s linear infinite';
    
    try {
        const url = `/api/notes${bypassCache ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
            allNotes = data.notes;
            lastUpdatedTime = data.last_updated;
            lastUpdatedText.textContent = `Synced: ${lastUpdatedTime}`;
            renderUI();
            fetchStats();
        } else {
            throw new Error(data.error || 'Unknown error occurred while fetching feed.');
        }
    } catch (err) {
        console.error('Error fetching release notes:', err);
        errorMessage.textContent = err.message || 'Failed to fetch release notes. Please check your internet connection.';
        showState('error');
    } finally {
        refreshBtn.classList.remove('refreshing');
        if (refreshIcon) refreshIcon.style.animation = '';
    }
}

// State display management
function showState(state) {
    loadingState.style.display = state === 'loading' ? 'flex' : 'none';
    errorState.style.display = state === 'error' ? 'flex' : 'none';
    emptyState.style.display = state === 'empty' ? 'flex' : 'none';
    notesGrid.style.display = state === 'grid' ? 'grid' : 'none';
}

// Main rendering logic
function renderUI() {
    // Filter and Search notes
    const filteredNotes = getFilteredNotes();
    
    // Update badge counts
    updateBadgeCounts();
    
    if (filteredNotes.length === 0) {
        showState('empty');
        return;
    }
    
    // Generate HTML for notes
    notesGrid.innerHTML = '';
    filteredNotes.forEach(note => {
        const card = createNoteCard(note);
        notesGrid.appendChild(card);
    });
    
    // Re-initialize Lucide Icons for dynamic content
    lucide.createIcons();
    showState('grid');
}

// Get notes applying search query and active category chip filter
function getFilteredNotes() {
    return allNotes.filter(note => {
        // Filter by type
        const typeMatch = activeFilter === 'all' || note.type.toLowerCase() === activeFilter;
        
        // Filter by search text
        let searchMatch = true;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const titleMatch = note.date.toLowerCase().includes(query);
            const typeTextMatch = note.type.toLowerCase().includes(query);
            const contentMatch = note.content_text.toLowerCase().includes(query);
            searchMatch = titleMatch || typeTextMatch || contentMatch;
        }
        
        return typeMatch && searchMatch;
    });
}

// Calculate counts of each type based on current search query (or overall)
function updateBadgeCounts() {
    // Count active categories under search query
    const counts = { all: 0, feature: 0, announcement: 0, breaking: 0, change: 0, issue: 0 };
    
    allNotes.forEach(note => {
        // Evaluate search matches independently
        let searchMatch = true;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            searchMatch = note.date.toLowerCase().includes(query) || 
                          note.type.toLowerCase().includes(query) || 
                          note.content_text.toLowerCase().includes(query);
        }
        
        if (searchMatch) {
            counts.all++;
            const type = note.type.toLowerCase();
            if (counts.hasOwnProperty(type)) {
                counts[type]++;
            }
        }
    });
    
    // Render counts on UI
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-feature').textContent = counts.feature;
    document.getElementById('count-announcement').textContent = counts.announcement;
    document.getElementById('count-breaking').textContent = counts.breaking;
    document.getElementById('count-change').textContent = counts.change;
    document.getElementById('count-issue').textContent = counts.issue;
}

// Create a DOM note card element
function createNoteCard(note) {
    const isSelected = selectedNoteIds.has(note.id);
    const card = document.createElement('div');
    card.className = `note-card ${isSelected ? 'selected' : ''}`;
    card.dataset.id = note.id;
    
    // Assign custom CSS variables for coloring tags and top border based on note type
    const typeColor = getTypeColor(note.type);
    card.style.setProperty('--color-type', typeColor.primary);
    card.style.setProperty('--bg-type', typeColor.bg);
    
    card.innerHTML = `
        <div class="card-top">
            <div class="card-metadata">
                <span class="card-date">${note.date}</span>
                <span class="card-type-tag">${note.type}</span>
            </div>
            <div class="card-selector" title="Select this update">
                <i data-lucide="check"></i>
            </div>
        </div>
        <div class="card-body">
            ${note.content_html}
        </div>
        <div class="card-footer">
            <a href="${note.link}" target="_blank" class="card-permalink" title="View official release notes">
                <i data-lucide="external-link"></i>
                <span>Official Log</span>
            </a>
            <div class="card-actions-right">
                <button class="btn-card-tweet btn-card-share" title="Draft a tweet for this update">
                    <i data-lucide="twitter"></i>
                    <span>Tweet</span>
                </button>
            </div>
        </div>
    `;
    
    // Bind selection event to clicking anywhere EXCEPT link and tweet button
    card.addEventListener('click', (e) => {
        const isInteractive = e.target.closest('a') || e.target.closest('button') || e.target.closest('code');
        if (!isInteractive) {
            toggleNoteSelection(note.id);
        }
    });
    
    // Card tweet draft button click
    const tweetBtn = card.querySelector('.btn-card-share');
    tweetBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop card selection toggle
        openComposerWithSingleNote(note);
    });
    
    return card;
}

// Map types to CSS color themes
function getTypeColor(type) {
    const t = type.toLowerCase();
    switch (t) {
        case 'feature':
            return { primary: 'var(--color-feature)', bg: 'var(--bg-feature)' };
        case 'announcement':
            return { primary: 'var(--color-announcement)', bg: 'var(--bg-announcement)' };
        case 'breaking':
            return { primary: 'var(--color-breaking)', bg: 'var(--bg-breaking)' };
        case 'change':
            return { primary: 'var(--color-change)', bg: 'var(--bg-change)' };
        case 'issue':
            return { primary: 'var(--color-issue)', bg: 'var(--bg-issue)' };
        default:
            return { primary: 'var(--color-general)', bg: 'var(--bg-general)' };
    }
}

// Handle note selection toggles
function toggleNoteSelection(id) {
    if (selectedNoteIds.has(id)) {
        selectedNoteIds.delete(id);
    } else {
        selectedNoteIds.add(id);
    }
    
    // Reflect changes in card class
    const card = document.querySelector(`.note-card[data-id="${id}"]`);
    if (card) {
        card.classList.toggle('selected', selectedNoteIds.has(id));
    }
    
    updateFloatingDock();
}

// Update the bottom floating drawer dock
function updateFloatingDock() {
    const count = selectedNoteIds.size;
    if (count > 0) {
        dockSelectedCount.textContent = count;
        document.getElementById('dock-text').textContent = count === 1 ? 'Update selected to share' : 'Updates selected to share';
        floatingShareDock.classList.add('visible');
        floatingShareDock.style.display = 'block';
    } else {
        floatingShareDock.classList.remove('visible');
        setTimeout(() => {
            if (selectedNoteIds.size === 0) floatingShareDock.style.display = 'none';
        }, 300);
    }
}

// Handle category chip filter clicks
function handleFilterClick(e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    
    // Update active state
    filterChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    
    activeFilter = chip.dataset.type;
    renderUI();
}

// Handle search queries
function handleSearch(e) {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    renderUI();
}

// Reset search box
function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderUI();
}

// Reset all search values and filters
function resetAllFilters() {
    clearSearch();
    activeFilter = 'all';
    filterChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    filterChipsContainer.querySelector('[data-type="all"]').classList.add('active');
    renderUI();
}

/* Modal and Tweet Composer Logic */
let activeComposerNotes = [];
let originalTweetText = '';
let hasHashtags = false;

// Prepare formatting for a set of notes
function generateInitialTweetText(notes) {
    if (notes.length === 1) {
        const note = notes[0];
        const emoji = getEmojiForType(note.type);
        return `${emoji} New BigQuery ${note.type} (${note.date}):\n\n${note.content_text}\n\nRead details: ${note.link}`;
    } else {
        // Multi-select tweet formatting
        let text = `🚀 BigQuery Updates Round-up:\n`;
        notes.forEach((note, index) => {
            const emoji = getEmojiForType(note.type);
            const summary = note.content_text.length > 80 ? note.content_text.substring(0, 77) + '...' : note.content_text;
            text += `\n${index + 1}. ${emoji} ${note.type} - ${summary}`;
        });
        
        // Use the link of the first note or generic release log
        const mainLink = notes[0].link.split('#')[0] || 'https://docs.cloud.google.com/bigquery/docs/release-notes';
        text += `\n\nFull Release Logs: ${mainLink}`;
        return text;
    }
}

function getEmojiForType(type) {
    const t = type.toLowerCase();
    if (t === 'feature') return '🚀';
    if (t === 'announcement') return '📢';
    if (t === 'breaking') return '⚠️';
    if (t === 'change') return '🔄';
    if (t === 'issue') return '🐛';
    return '📝';
}

// Open composer with a single specific note
function openComposerWithSingleNote(note) {
    activeComposerNotes = [note];
    openComposerCommon();
}

// Open composer with all currently selected notes from the floating dock
function openComposer() {
    activeComposerNotes = allNotes.filter(n => selectedNoteIds.has(n.id));
    openComposerCommon();
}

function openComposerCommon() {
    if (activeComposerNotes.length === 0) return;
    
    hasHashtags = false;
    originalTweetText = generateInitialTweetText(activeComposerNotes);
    tweetTextarea.value = originalTweetText;
    
    // Trigger render updates
    handleComposerInput();
    
    // Display Modal
    composerModal.classList.add('visible');
    composerModal.style.display = 'flex';
    tweetTextarea.focus();
}

// Close composer
function closeComposer() {
    composerModal.classList.remove('visible');
    setTimeout(() => {
        composerModal.style.display = 'none';
    }, 300);
}

// Listen to textarea updates and refresh live tweet card preview
function handleComposerInput() {
    const text = tweetTextarea.value;
    
    // Parse links to highlight in preview (similar to Twitter highlighting URLs)
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const previewHtml = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(urlPattern, '<a href="$1" target="_blank">$1</a>')
        .replace(/#(\w+)/g, '<a href="https://twitter.com/hashtag/$1" target="_blank">#$1</a>');
        
    tweetPreviewText.innerHTML = previewHtml || '<span style="color: var(--text-muted)">Draft text preview will show here...</span>';
    
    updateCharacterCount(text.length);
}

// Render dynamic character counter and circular loader ring
function initProgressRing() {
    progressRingFill.style.strokeDasharray = RING_CIRCUMFERENCE;
    progressRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function updateCharacterCount(length) {
    const remaining = TWEET_LIMIT - length;
    charCountText.textContent = remaining;
    
    // Progress fill percentage
    const percent = Math.min((length / TWEET_LIMIT) * 100, 100);
    const strokeDashoffset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
    progressRingFill.style.strokeDashoffset = strokeDashoffset;
    
    // Visual indicators based on limit proximity
    const counterContainer = document.querySelector('.character-counter-container');
    if (remaining < 0) {
        counterContainer.classList.add('char-limit-warning');
        progressRingFill.style.stroke = '#ef4444'; // Red
        btnTweetNow.disabled = true;
        btnTweetNow.style.opacity = 0.5;
        btnTweetNow.style.cursor = 'not-allowed';
    } else if (remaining <= 20) {
        counterContainer.classList.remove('char-limit-warning');
        progressRingFill.style.stroke = '#f59e0b'; // Amber warning
        btnTweetNow.disabled = false;
        btnTweetNow.style.opacity = 1;
        btnTweetNow.style.cursor = 'pointer';
    } else {
        counterContainer.classList.remove('char-limit-warning');
        progressRingFill.style.stroke = 'var(--color-primary)'; // Blue normal
        btnTweetNow.disabled = false;
        btnTweetNow.style.opacity = 1;
        btnTweetNow.style.cursor = 'pointer';
    }
}

// Client-side text summarization logic (WOW factor helper)
function autoSummarizeTweet() {
    if (activeComposerNotes.length === 0) return;
    
    let summarizedText = '';
    
    if (activeComposerNotes.length === 1) {
        const note = activeComposerNotes[0];
        const emoji = getEmojiForType(note.type);
        
        // Clean up brackets, code snippets, etc.
        let text = note.content_text;
        
        // Sentence tokenization by period
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        
        let summarizedBody = '';
        if (sentences.length > 0) {
            // Take the first sentence (which usually states the feature)
            summarizedBody = sentences[0].trim();
            
            // If the first sentence is very short, append the second sentence if available
            if (summarizedBody.length < 80 && sentences.length > 1) {
                summarizedBody += ' ' + sentences[1].trim();
            }
        } else {
            summarizedBody = text;
        }
        
        // Compose summary format
        const header = `${emoji} BigQuery ${note.type} (${note.date}):\n\n`;
        const footer = `\n\nRead more: ${note.link}`;
        
        const maxBodyLength = TWEET_LIMIT - header.length - footer.length - 4; // safety gap
        
        if (summarizedBody.length > maxBodyLength) {
            summarizedBody = summarizedBody.substring(0, maxBodyLength - 3) + '...';
        }
        
        summarizedText = `${header}${summarizedBody}${footer}`;
    } else {
        // Multi-note summarization: shorten item bodies
        const emoji = '🚀';
        const header = `BigQuery Updates Round-up:\n`;
        const footer = `\nFull Release Logs: ${activeComposerNotes[0].link.split('#')[0]}`;
        
        let itemsText = '';
        activeComposerNotes.forEach((note, index) => {
            const noteEmoji = getEmojiForType(note.type);
            // Shorten to first clause
            let cleanText = note.content_text.split('.')[0] || note.content_text;
            if (cleanText.length > 50) cleanText = cleanText.substring(0, 47) + '...';
            itemsText += `\n${index + 1}. ${noteEmoji} ${cleanText}`;
        });
        
        summarizedText = `${header}${itemsText}\n${footer}`;
        
        // If still exceeds, truncate the list
        if (summarizedText.length > TWEET_LIMIT) {
            itemsText = '';
            // Only take first 3 updates
            activeComposerNotes.slice(0, 3).forEach((note, index) => {
                const noteEmoji = getEmojiForType(note.type);
                itemsText += `\n${noteEmoji} ${note.type}: ${note.content_text.substring(0, 35)}...`;
            });
            summarizedText = `${header}${itemsText}\n${footer}`;
        }
    }
    
    tweetTextarea.value = summarizedText;
    handleComposerInput();
}

// Toggle Hashtags
function toggleHashtags() {
    let text = tweetTextarea.value;
    const hashtagStr = '\n\n#GoogleCloud #BigQuery';
    
    if (hasHashtags) {
        // Remove hashtags
        text = text.replace(hashtagStr, '');
        hasHashtags = false;
    } else {
        // Append hashtags before link (if link exists at the end)
        const linkIndex = text.lastIndexOf('http');
        if (linkIndex !== -1) {
            text = text.slice(0, linkIndex).trim() + hashtagStr + '\n\n' + text.slice(linkIndex);
        } else {
            text = text.trim() + hashtagStr;
        }
        hasHashtags = true;
    }
    
    tweetTextarea.value = text;
    handleComposerInput();
}

// Revert back to original draft content
function resetTweetText() {
    tweetTextarea.value = originalTweetText;
    hasHashtags = false;
    handleComposerInput();
}

// Launch Twitter/X Web Intent link
function publishTweet() {
    const text = tweetTextarea.value;
    if (text.length > TWEET_LIMIT) {
        alert("Your tweet exceeds the 280 character limit. Please shorten it before posting.");
        return;
    }
    
    const encodedText = encodeURIComponent(text);
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    
    // Open X Intent
    window.open(intentUrl, '_blank', 'width=550,height=420,referrerpolicy=no-referrer');
}

// Fetch Database Stats & SMTP Status
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error('Failed to retrieve system status.');
        const data = await response.json();
        
        if (data.success) {
            // Update Database Stats
            if (dbTotalCount) {
                dbTotalCount.textContent = `${data.stats.total_notes} notes`;
            }
            
            // Update Email Status
            if (emailConfigStatus && emailStatusIcon && testEmailBtn) {
                if (data.stats.email_configured) {
                    emailConfigStatus.textContent = 'Active (Ready)';
                    emailConfigStatus.className = 'status-val configured';
                    emailStatusIcon.className = 'status-icon text-green';
                    testEmailBtn.disabled = false;
                } else {
                    emailConfigStatus.textContent = 'Pending Setup';
                    emailConfigStatus.className = 'status-val pending';
                    emailStatusIcon.className = 'status-icon text-orange';
                    testEmailBtn.disabled = true;
                }
            }
        }
    } catch (err) {
        console.error('Error fetching database/email stats:', err);
    }
}

// Trigger Manual Test Email
async function sendTestEmail() {
    if (!testEmailBtn) return;
    
    // Set loading state
    testEmailBtn.disabled = true;
    const origHtml = testEmailBtn.innerHTML;
    testEmailBtn.innerHTML = '<i class="spinner-ring" style="width:12px;height:12px;margin-right:4px;display:inline-block;animation:rotate 1s linear infinite"></i>Sending...';
    
    try {
        const response = await fetch('/api/test-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            showToast('Test email sent successfully! Check your inbox.', 'success');
        } else {
            showToast(data.error || 'Failed to send test email.', 'error');
        }
    } catch (err) {
        console.error('Error triggering test email:', err);
        showToast('Error connecting to the test-email service.', 'error');
    } finally {
        testEmailBtn.disabled = false;
        testEmailBtn.innerHTML = origHtml;
        fetchStats(); // Update stats
    }
}

// Visual Toast feedback helper
function showToast(message, type = 'info') {
    // Remove existing toast if present
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    // Choose icon
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Initialize icon
    if (window.lucide) {
        window.lucide.createIcons({
            attrs: { class: 'toast-icon' }
        });
    }
    
    // Fade out after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s ease-out forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}
