const pet = document.getElementById('pet-container');
const display = document.getElementById('action-display');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.querySelector('.chat-send');
const assetBustSuffix = window.__assetBust ? `?v=${window.__assetBust}` : '';

if (pet) {
    pet.style.backgroundImage = `url('site_pet_grid.png${assetBustSuffix}')`;
}

// --- Chat configuration ---
// Point PROXY_URL at proxy.php once deployed to WPEngine.
const PROXY_URL = 'proxy.php';

// Conversation history sent to Claude on each request (roles: user / assistant)
const conversationHistory = [];

function appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = `chat-message ${role}`;
    el.textContent = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return el;
}

function setInputBusy(busy) {
    chatInput.disabled = busy;
    chatSend.disabled = busy;
}

async function sendMessage(userText) {
    if (!userText.trim()) return;

    appendMessage('user', userText);
    conversationHistory.push({ role: 'user', content: userText });

    const thinkingEl = appendMessage('thinking', 'Cody is thinking…');
    setInputBusy(true);
    Cody.trigger('thinking');

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: conversationHistory })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        const reply = data.content?.[0]?.text ?? 'Sorry, I didn\'t catch that.';

        thinkingEl.remove();
        conversationHistory.push({ role: 'assistant', content: reply });
        appendMessage('cody', reply);
        Cody.trigger('responding');

        // Return to idle after the response emote finishes
        setTimeout(() => Cody.release(), 2000);

    } catch (err) {
        thinkingEl.remove();
        appendMessage('cody', 'Something went wrong. Please try again.');
        Cody.trigger('error');
        setTimeout(() => Cody.release(), 2000);
    } finally {
        setInputBusy(false);
        chatInput.focus();
    }
}

if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        sendMessage(text);
    });
}

// Centralized config so controls and behavior are easy to adjust later.
const CONFIG = {
    controls: {
        moveLeft: 'ArrowLeft',
        moveRight: 'ArrowRight',
        beg: 'ArrowUp',
        sleep: 'ArrowDown',
        snarl: 'Space',
        lick: 'KeyA',
        wag: 'KeyS',
        pout: 'KeyD'
    },
    movement: {
        speedPxPerSecond: 160
    },
    idle: {
        layAfterMs: 14000,
        sprinkleMinMs: 2200,
        sprinkleMaxMs: 3800,
        sprinkleDurationMs: 1800
    }
};

const ACTIONS = {
    walk: {
        className: 'action-walk',
        text: 'Action: Walking (Use Left/Right arrows)'
    },
    sit: {
        className: 'action-sit',
        text: 'Action: Sitting (Hold Up Arrow to beg)'
    },
    lay: {
        className: 'action-lay',
        text: 'Action: Laying Down (Hold Up Arrow to beg)'
    },
    beg: {
        className: 'action-beg',
        text: 'Action: Begging (Hold Up Arrow)'
    },
    snarl: {
        className: 'action-snarl',
        text: 'Action: Snarl (Press Space)'
    },
    spin: {
        className: 'action-spin',
        text: 'Action: Spin'
    },
    lick: {
        className: 'action-lick',
        text: 'Action: Licking Paw (Press A)'
    },
    wag: {
        className: 'action-wag',
        text: 'Action: Wagging Tail (Press S)'
    },
    pout: {
        className: 'action-pout',
        text: 'Action: Pouting (Press D)'
    },
    croc: {
        className: 'action-croc',
        text: 'Action: Croc'
    }
};

const ACTION_CLASSES = Object.values(ACTIONS).map((action) => action.className);
const activeKeys = new Set();
// Cody is locked in place, so we don't track movement keys
const trackedKeys = [
    CONFIG.controls.beg,
    CONFIG.controls.sleep,
    CONFIG.controls.snarl,
    CONFIG.controls.lick,
    CONFIG.controls.wag,
    CONFIG.controls.pout
];

let currentAction = null;
let facing = -1; // Face left by default
let positionX = 0; // Locked in corner, no movement
let lastIdleAction = 'sit';
let lastFrameTime = performance.now();
let idleLayTimerId = null;
let idleSprinkleTimerId = null;
let idleSprinkleResetTimerId = null;
let pendingSpinFacing = null;
let crocBuffer = '';
let crocBufferTimerId = null;

function clearIdleLayTimer() {
    if (idleLayTimerId !== null) {
        window.clearTimeout(idleLayTimerId);
        idleLayTimerId = null;
    }
}

function clearIdleSprinkleTimers() {
    if (idleSprinkleTimerId !== null) {
        window.clearTimeout(idleSprinkleTimerId);
        idleSprinkleTimerId = null;
    }

    if (idleSprinkleResetTimerId !== null) {
        window.clearTimeout(idleSprinkleResetTimerId);
        idleSprinkleResetTimerId = null;
    }
}

function clearIdleTimers() {
    clearIdleLayTimer();
    clearIdleSprinkleTimers();
}

function getHeldEmoteAction() {
    if (isBegPressed()) {
        return 'beg';
    }

    return null;
}

function isIdleEligible() {
    if (Cody.isTriggered()) {
        return false;
    }

    if (currentAction !== 'sit') {
        return false;
    }

    if (getMoveDirection() !== 0) {
        return false;
    }

    return getHeldEmoteAction() === null;
}

function getRandomSprinkleAction() {
    return Math.random() < 0.5 ? 'lick' : 'wag';
}

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scheduleIdleTimers() {
    clearIdleTimers();

    if (currentAction !== 'sit') {
        return;
    }

    const idleStartedAt = Date.now();

    function scheduleNextSprinkle() {
        const elapsedMs = Date.now() - idleStartedAt;
        const remainingMs = CONFIG.idle.layAfterMs - elapsedMs;

        if (remainingMs <= CONFIG.idle.sprinkleDurationMs + 300) {
            return;
        }

        const waitMs = Math.min(
            randomBetween(CONFIG.idle.sprinkleMinMs, CONFIG.idle.sprinkleMaxMs),
            Math.max(200, remainingMs - CONFIG.idle.sprinkleDurationMs - 200)
        );

        idleSprinkleTimerId = window.setTimeout(() => {
            if (!isIdleEligible()) {
                return;
            }

            const sprinkleAction = getRandomSprinkleAction();
            setAction(sprinkleAction);

            idleSprinkleResetTimerId = window.setTimeout(() => {
                if (Cody.isTriggered()) {
                    return;
                }

                if (getMoveDirection() !== 0 || getHeldEmoteAction() !== null) {
                    return;
                }

                setAction('sit');
                scheduleNextSprinkle();
            }, CONFIG.idle.sprinkleDurationMs);
        }, waitMs);
    }

    scheduleNextSprinkle();

    idleLayTimerId = window.setTimeout(() => {
        if (Cody.isTriggered()) {
            return;
        }

        if (getMoveDirection() !== 0 || getHeldEmoteAction() !== null) {
            return;
        }

        lastIdleAction = 'lay';
        setAction('lay');
    }, CONFIG.idle.layAfterMs);
}

function isBegPressed() {
    return activeKeys.has(CONFIG.controls.beg);
}

function getMoveDirection() {
    const leftPressed = activeKeys.has(CONFIG.controls.moveLeft);
    const rightPressed = activeKeys.has(CONFIG.controls.moveRight);

    if (leftPressed && !rightPressed) {
        return -1;
    }

    if (rightPressed && !leftPressed) {
        return 1;
    }

    return 0;
}

function setAction(actionKey) {
    if (currentAction === actionKey) {
        return;
    }

    const action = ACTIONS[actionKey];
    if (!action) {
        return;
    }

    pet.classList.remove(...ACTION_CLASSES);
    pet.classList.add(action.className);
    if (display) {
        display.textContent = action.text;
    }
    currentAction = actionKey;
    scheduleIdleTimers();
}

pet.addEventListener('animationend', () => {
    if (currentAction === 'beg' && getHeldEmoteAction() === null && !Cody.isTriggered()) {
        if (getMoveDirection() !== 0) {
            setAction('walk');
            return;
        }

        setAction(lastIdleAction);
        return;
    }

    if ((currentAction === 'snarl' || currentAction === 'lick' || currentAction === 'wag' || currentAction === 'pout') && !Cody.isTriggered()) {
        lastIdleAction = 'sit';
        setAction('sit');
        return;
    }

    if (currentAction === 'spin' && !Cody.isTriggered()) {
        if (pendingSpinFacing !== null) {
            facing = pendingSpinFacing;
            pet.style.transform = `scaleX(${facing})`;
            pendingSpinFacing = null;
        }

        const heldEmote = getHeldEmoteAction();
        if (heldEmote !== null) {
            setAction(heldEmote);
            return;
        }

        if (getMoveDirection() !== 0) {
            setAction('walk');
            return;
        }

        setAction(lastIdleAction);
    }
});

function applyIdleAction() {
    lastIdleAction = 'sit';
    setAction('sit');
}

function triggerCornerSpin(atLeftCorner) {
    if (currentAction === 'spin') {
        return;
    }

    if (atLeftCorner) {
        pet.style.transform = 'scaleX(-1)';
        pendingSpinFacing = 1;
    } else {
        pet.style.transform = 'scaleX(1)';
        pendingSpinFacing = -1;
    }

    setAction('spin');
}

function syncActionFromInputs() {
    const heldEmote = getHeldEmoteAction();
    if (heldEmote !== null) {
        setAction(heldEmote);
        return;
    }

    if (getMoveDirection() !== 0) {
        setAction('walk');
        return;
    }

    setAction(lastIdleAction);
}

function pushTypedKey(key) {
    if (typeof key !== 'string' || key.length !== 1) {
        return;
    }

    const ch = key.toLowerCase();
    if (!/[a-z]/.test(ch)) {
        return;
    }

    crocBuffer = (crocBuffer + ch).slice(-4);

    if (crocBufferTimerId !== null) {
        window.clearTimeout(crocBufferTimerId);
    }

    crocBufferTimerId = window.setTimeout(() => {
        crocBuffer = '';
        crocBufferTimerId = null;
    }, 1200);

    if (crocBuffer === 'croc') {
        setAction('croc');
        crocBuffer = '';
        window.clearTimeout(crocBufferTimerId);
        crocBufferTimerId = null;
    }
}

function clampPosition() {
    // Cody position is now fixed via CSS at bottom-right, no longer managed via JS
}

document.addEventListener('keydown', (event) => {
    pushTypedKey(event.key);

    if (!trackedKeys.includes(event.code)) {
        return;
    }

    if (Cody.isTriggered()) {
        return;
    }

    if (event.code === CONFIG.controls.sleep) {
        if (!event.repeat) {
            lastIdleAction = 'lay';
            setAction('lay');
        }
        return;
    }

    if (event.code === CONFIG.controls.pout) {
        if (!event.repeat) {
            setAction('pout');
        }
        return;
    }

    if (event.code === CONFIG.controls.snarl) {
        if (!event.repeat) {
            setAction('snarl');
        }
        return;
    }

    if (event.code === CONFIG.controls.lick) {
        if (!event.repeat) {
            setAction('lick');
        }
        return;
    }

    if (event.code === CONFIG.controls.wag) {
        if (!event.repeat) {
            setAction('wag');
        }
        return;
    }

    if (event.code === CONFIG.controls.beg) {
        activeKeys.add(event.code);
        if (!event.repeat && currentAction === 'lay') {
            lastIdleAction = 'sit';
            setAction('sit');
            return;
        }
        syncActionFromInputs();
        return;
    }

    // Movement keys are no longer tracked; Cody is locked in place
});

document.addEventListener('keyup', (event) => {
    if (!trackedKeys.includes(event.code)) {
        return;
    }

    if (Cody.isTriggered()) {
        return;
    }

    const wasMoving = getMoveDirection() !== 0;
    activeKeys.delete(event.code);
    const isMovingNow = getMoveDirection() !== 0;

    if (event.code === CONFIG.controls.beg) {
        syncActionFromInputs();
        return;
    }

    // Movement keys are no longer tracked; Cody is locked in place
});

window.addEventListener('resize', clampPosition);

function tick(timestamp) {
    const deltaSeconds = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    // Cody is locked in place; no movement logic needed
    // Position is maintained at bottom-right corner via CSS

    requestAnimationFrame(tick);
}

pet.style.transform = `scaleX(${facing})`;
setAction('sit');
requestAnimationFrame(tick);

// --- External API ---
// Campaign manager calls Cody.trigger(stateName) to drive emotes,
// and Cody.release() to return keyboard/idle control.

const EMOTE_MAP = {
    thinking:   'beg',
    typing:     'walk',
    responding: 'wag',
    idle:       'sit',
    sleeping:   'lay',
    error:      'snarl',
    snarling:   'snarl',
    spinning:   'spin',
    licking:    'lick',
    wagging:    'wag',
    pouting:    'pout',
    croc:       'croc'
};

let triggeredState = null;

const Cody = {
    // Fire a semantic emote: Cody.trigger('thinking')
    trigger(stateName) {
        const actionKey = EMOTE_MAP[stateName];
        if (!actionKey || !ACTIONS[actionKey]) {
            return;
        }

        triggeredState = stateName;
        clearIdleLayTimer();
        setAction(actionKey);
    },

    // Return control to keyboard / idle behavior
    release() {
        triggeredState = null;
        if (getMoveDirection() !== 0) {
            setAction('walk');
        } else {
            applyIdleAction();
        }
    },

    // Returns true while an external emote is active
    isTriggered() {
        return triggeredState !== null;
    },

    // Register a new emote mapping without touching core config
    // e.g. Cody.mapEmote('celebrating', 'wag')
    mapEmote(stateName, actionKey) {
        if (!ACTIONS[actionKey]) {
            return;
        }

        EMOTE_MAP[stateName] = actionKey;
    }
};

window.Cody = Cody;