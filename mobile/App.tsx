import { useRef, useState } from "react";
// expo/fetch supports reading the response body as a stream; React Native's built-in fetch does not.
import { fetch } from "expo/fetch";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

// NOTE: Set the backend URL to your own IP. Do NOT use localhost; use your computer's local IP.
const BACKEND_URL = "http://192.168.111.4:3000/ask/stream";
// Keep in sync with server/app.ts.
const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 10;
// Give up if the server sends nothing for this long. The server's own limits (10s for embeddings,
// 30s for the model) end a request sooner, so this mostly catches an unreachable server.
// It restarts with every event, so a long answer that keeps streaming isn't cut off.
const RESPONSE_TIMEOUT_MS = 60_000;
const TIMEOUT_MESSAGE = "Sunucu zamanında cevap vermedi. Bağlantını kontrol edip tekrar dene.";

type Source = {
  id: string;
  content: string;
  score: number;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  // Assistant messages only
  sources?: Source[];
  status?: "streaming" | "done" | "error";
};

type ChatTurn = { role: "user" | "assistant"; content: string };

// One line of the backend's NDJSON stream.
type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

// Reads an NDJSON body line by line and calls onEvent for each parsed event.
async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // A chunk can end mid-line; keep the incomplete last line for the next read.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}

// The conversation sent with the next question: only exchanges whose answer completed,
// so a failed answer (and the question that caused it) doesn't confuse the model.
function historyFrom(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 0; i + 1 < messages.length; i++) {
    const question = messages[i];
    const answer = messages[i + 1];
    if (question?.role === "user" && answer?.role === "assistant" && answer.status === "done") {
      turns.push({ role: "user", content: question.content }, { role: "assistant", content: answer.content });
    }
  }
  return turns.slice(-MAX_HISTORY_MESSAGES);
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState("");
  const nextId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const updateMessage = (id: number, update: (message: ChatMessage) => ChatMessage) =>
    setMessages((previous) => previous.map((message) => (message.id === id ? update(message) : message)));

  const ask = async () => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setInputError("Lütfen bir soru yazın.");
      return;
    }
    if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
      setInputError(`Soru en fazla ${MAX_QUESTION_LENGTH} karakter olabilir.`);
      return;
    }

    const history = historyFrom(messages);
    const assistantId = nextId.current + 1;
    setMessages((previous) => [
      ...previous,
      { id: nextId.current, role: "user", content: normalizedQuestion },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    nextId.current += 2;
    setQuestion("");
    setInputError("");
    setLoading(true);

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restartTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, RESPONSE_TIMEOUT_MS);
    };
    restartTimer();

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: normalizedQuestion, history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Sunucu hatası: ${res.status}`);
      }
      if (!res.body) {
        throw new Error("Sunucudan geçersiz yanıt alındı.");
      }

      let finished = false;
      await readEvents(res.body, (event) => {
        restartTimer();
        switch (event.type) {
          case "sources":
            updateMessage(assistantId, (message) => ({ ...message, sources: event.sources }));
            break;
          case "delta":
            updateMessage(assistantId, (message) => ({ ...message, content: message.content + event.text }));
            break;
          case "done":
            finished = true;
            break;
          case "error":
            throw new Error(event.error);
        }
      });

      if (!finished) {
        throw new Error("Bağlantı yarıda kesildi, cevap eksik olabilir.");
      }
      updateMessage(assistantId, (message) => ({ ...message, status: "done" }));
    } catch (err: unknown) {
      let errorMessage = err instanceof Error ? err.message : "Bir hata oluştu.";
      if (timedOut) errorMessage = TIMEOUT_MESSAGE;
      // Keep any partial answer visible, followed by the error.
      updateMessage(assistantId, (message) => ({
        ...message,
        status: "error",
        content: message.content ? `${message.content}\n\n${errorMessage}` : errorMessage,
      }));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setInputError("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Sigorta AI Asistan</Text>
          {messages.length > 0 && (
            <TouchableOpacity onPress={newChat} disabled={loading}>
              <Text style={[styles.newChat, loading && styles.disabledText]}>Yeni sohbet</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          // Keep the newest message in view while the answer streams in.
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.subtitle}>Poliçen hakkında bir soru sor</Text>
              <Text style={styles.emptyHint}>
                Örn: Kasko cam kırılması karşılanıyor mu? Ardından "Peki muafiyet var mı?" gibi takip
                soruları sorabilirsin.
              </Text>
            </View>
          )}

          {messages.map((message) =>
            message.role === "user" ? (
              <View key={message.id} style={styles.userBubble}>
                <Text style={styles.userText}>{message.content}</Text>
              </View>
            ) : (
              <View key={message.id} style={[styles.answerBox, message.status === "error" && styles.answerError]}>
                {message.status === "streaming" && message.content === "" ? (
                  <ActivityIndicator style={styles.spinner} />
                ) : (
                  <Text style={[styles.answerText, message.status === "error" && styles.errorText]}>
                    {message.content}
                  </Text>
                )}
                {message.status === "done" && (message.sources?.length ?? 0) > 0 && (
                  <View style={styles.sources}>
                    <Text style={styles.sourcesLabel}>Kaynaklar:</Text>
                    {message.sources?.map((source) => (
                      <View key={source.id} style={styles.source}>
                        <Text style={styles.sourceId}>{source.id}</Text>
                        <Text style={styles.sourceText}>{source.content}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          {inputError !== "" && <Text style={styles.inputError}>{inputError}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={messages.length ? "Bir soru daha sor…" : "Örn: Kasko cam kırılması karşılanıyor mu?"}
              placeholderTextColor="#999"
              value={question}
              onChangeText={setQuestion}
              multiline
              maxLength={MAX_QUESTION_LENGTH}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={ask}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? "…" : "Sor"}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.characterCount}>
            {question.length}/{MAX_QUESTION_LENGTH}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: "bold", color: "#1a1a2e" },
  newChat: { color: "#e60028", fontSize: 15, fontWeight: "600" },
  disabledText: { opacity: 0.4 },
  messages: { paddingHorizontal: 20, paddingBottom: 12 },
  empty: { marginTop: 24 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 8 },
  emptyHint: { fontSize: 14, lineHeight: 20, color: "#888" },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  userText: { color: "#fff", fontSize: 16, lineHeight: 22 },
  answerBox: {
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#e60028",
  },
  answerError: { borderLeftColor: "#999" },
  spinner: { alignSelf: "flex-start" },
  answerText: { fontSize: 16, lineHeight: 24, color: "#333" },
  errorText: { color: "#e60028" },
  sources: { marginTop: 12 },
  sourcesLabel: { fontWeight: "700", marginBottom: 4, color: "#1a1a2e" },
  source: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8, marginTop: 8 },
  sourceId: { fontSize: 13, fontWeight: "600", color: "#666", marginBottom: 4 },
  sourceText: { fontSize: 14, lineHeight: 20, color: "#555" },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  inputError: { color: "#e60028", marginBottom: 6, fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  button: {
    backgroundColor: "#e60028",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  characterCount: { alignSelf: "flex-end", color: "#999", fontSize: 12, marginTop: 4 },
});
