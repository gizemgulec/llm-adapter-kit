import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from "react-native";

// NOTE: Set the backend URL to your own IP. Do NOT use localhost; use your computer's local IP.
const BACKEND_URL = "http://192.168.111.4:3000/ask";
const MAX_QUESTION_LENGTH = 1000;

type Source = {
  id: string;
  content: string;
  score: number;
};

type AskResponse = {
  answer?: string;
  sources?: Source[];
  error?: string;
};

export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setError("Lütfen bir soru yazın.");
      return;
    }
    if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
      setError(`Soru en fazla ${MAX_QUESTION_LENGTH} karakter olabilir.`);
      return;
    }

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: normalizedQuestion }),
      });

      const data: AskResponse = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Sunucu hatası: ${res.status}`);
      }
      if (typeof data.answer !== "string") {
        throw new Error("Sunucudan geçersiz yanıt alındı.");
      }

      setAnswer(data.answer);
      setSources(data.sources ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sigorta AI Asistan</Text>
        <Text style={styles.subtitle}>Poliçen hakkında bir soru sor</Text>

        <TextInput
          style={styles.input}
          placeholder="Örn: Kasko cam kırılması karşılanıyor mu?"
          placeholderTextColor="#999"
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={MAX_QUESTION_LENGTH}
        />
        <Text style={styles.characterCount}>
          {question.length}/{MAX_QUESTION_LENGTH}
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={ask}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Soruluyor..." : "Sor"}</Text>
        </TouchableOpacity>

        {loading && <ActivityIndicator style={{ marginTop: 20 }} size="large" />}

        {error !== "" && <Text style={styles.error}>{error}</Text>}

        {answer !== "" && (
          <View style={styles.answerBox}>
            <Text style={styles.answerLabel}>Cevap:</Text>
            <Text style={styles.answerText}>{answer}</Text>
            {sources.length > 0 && (
              <View style={styles.sources}>
                <Text style={styles.sourcesLabel}>Kaynaklar:</Text>
                {sources.map((source) => (
                  <View key={source.id} style={styles.source}>
                    <Text style={styles.sourceId}>{source.id}</Text>
                    <Text style={styles.sourceText}>{source.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 20 },
  title: { fontSize: 26, fontWeight: "bold", marginTop: 20, color: "#1a1a2e" },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 24, marginTop: 4 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  characterCount: { alignSelf: "flex-end", color: "#666", marginTop: 6 },
  button: {
    backgroundColor: "#e60028",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  error: { color: "#e60028", marginTop: 20, fontSize: 15 },
  answerBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#e60028",
  },
  answerLabel: { fontWeight: "700", marginBottom: 8, color: "#1a1a2e" },
  answerText: { fontSize: 16, lineHeight: 24, color: "#333" },
  sources: { marginTop: 16 },
  sourcesLabel: { fontWeight: "700", marginBottom: 8, color: "#1a1a2e" },
  source: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8, marginTop: 8 },
  sourceId: { fontSize: 13, fontWeight: "600", color: "#666", marginBottom: 4 },
  sourceText: { fontSize: 14, lineHeight: 20, color: "#555" },
});
