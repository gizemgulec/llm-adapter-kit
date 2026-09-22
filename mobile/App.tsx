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

// DİKKAT: Kendi IP'nle backend adresi. localhost DEĞİL, bilgisayarının yerel IP'si.
const BACKEND_URL = "http://192.168.111.4:3000/ask";

export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`);

      const data = await res.json();
      setAnswer(data.answer);
    } catch (err: any) {
      setError(err.message ?? "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Aksigorta AI Asistan</Text>
        <Text style={styles.subtitle}>Poliçen hakkında bir soru sor</Text>

        <TextInput
          style={styles.input}
          placeholder="Örn: Kasko cam kırılması karşılanıyor mu?"
          placeholderTextColor="#999"
          value={question}
          onChangeText={setQuestion}
          multiline
        />

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
});
