<?php
/**
 * Cody AI Proxy – WPEngine deployment with OpenRouter
 *
 * Keeps the OpenRouter API key server-side.
 * Called by script.js via POST with JSON body: { history: [...] }
 *
 * Setup:
 *   1. Create a .env file in this directory with: OPENROUTER_API_KEY=your_key_here
 *   2. Upload this file and .env to the same directory as index.html.
 *   3. Confirm PROXY_URL in script.js points to 'proxy.php'.
 */

header('Content-Type: application/json');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Load API key from .env file
$envFile = __DIR__ . '/.env';
if (!file_exists($envFile)) {
    http_response_code(500);
    echo json_encode(['error' => '.env file not found']);
    exit;
}

$env = parse_ini_file($envFile);
$apiKey = getenv('OPENROUTER_API_KEY') ?: ($env['OPENROUTER_API_KEY'] ?? null);

if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'API key not configured in .env']);
    exit;
}

// Parse incoming request body
$body = file_get_contents('php://input');
$payload = json_decode($body, true);

if (!isset($payload['history']) || !is_array($payload['history'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

// Sanitize history: only allow valid role/content pairs
$messages = [];
foreach ($payload['history'] as $turn) {
    if (
        isset($turn['role'], $turn['content']) &&
        in_array($turn['role'], ['user', 'assistant'], true) &&
        is_string($turn['content']) &&
        strlen($turn['content']) <= 4000
    ) {
        $messages[] = [
            'role'    => $turn['role'],
            'content' => htmlspecialchars_decode(strip_tags($turn['content']))
        ];
    }
}

if (empty($messages)) {
    http_response_code(400);
    echo json_encode(['error' => 'No valid messages in history']);
    exit;
}

// System prompt – describes Cody's role and the app context
$systemPrompt = <<<PROMPT
You are Cody, a friendly and concise AI assistant embedded in a kanban board and influencer database app for a marketing agency.

Your capabilities:
- Help users add, update, or remove tasks on the kanban board
- Help manage an influencer database (add, search, or remove influencers)
- Parse and explain uploaded Excel/XLS data when the user describes it
- Answer questions about project status and workflows

Guidelines:
- Keep responses short and actionable (2–4 sentences max unless detail is specifically requested)
- Use a warm, upbeat tone — you are a helpful dog sidekick
- If a task requires a destructive action (delete, remove), confirm with the user first
- If you are unsure, say so honestly rather than guessing
PROMPT;

// Insert system message at the beginning if not already present
array_unshift($messages, [
    'role'    => 'system',
    'content' => $systemPrompt
]);

// Build OpenRouter messages API request (OpenAI-compatible)
$openrouterPayload = json_encode([
    'model'       => 'stepfun/step-3.5-flash:free',
    'max_tokens'  => 512,
    'messages'    => $messages,
    'temperature' => 0.7
]);

// Call OpenRouter API via cURL
$ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $openrouterPayload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
        'HTTP-Referer: ' . ($_SERVER['HTTP_REFERER'] ?? ('https://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'))),
        'X-Title: Cody Assistant'
    ],
    CURLOPT_TIMEOUT        => 30,
]);

$result   = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode([
        'error' => 'Failed to reach OpenRouter API',
        'details' => $curlError
    ]);
    exit;
}

if ($httpCode !== 200) {
    http_response_code(502);
    $errorData = json_decode($result, true);
    echo json_encode([
        'error'  => 'OpenRouter API error',
        'status' => $httpCode,
        'message' => $errorData['error']['message'] ?? 'Unknown error'
    ]);
    exit;
}

// Transform OpenRouter response to match the format expected by script.js
// (It expects { content: [...] })
$response = json_decode($result, true);
$reply = $response['choices'][0]['message']['content'] ?? 'Sorry, I didn\'t catch that.';

echo json_encode([
    'content' => [
        [
            'type' => 'text',
            'text' => $reply
        ]
    ]
]);

