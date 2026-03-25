import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { generateStoryFromAPI } from '../../services/apiClient';

type Culture = 'Anadolu' | 'İskandinav' | 'Uzak Doğu' | 'Klasik Avrupa';
type AgeGroup = '1-3 Yaş' | '4-6 Yaş' | '7-9 Yaş' | '10+ Yaş';
type Atmosphere = 'Sakinleştirici/Uyku' | 'Neşeli' | 'Maceracı' | 'Eğitici';

const CULTURES: Culture[] = ['Anadolu', 'İskandinav', 'Uzak Doğu', 'Klasik Avrupa'];
const AGE_GROUPS: AgeGroup[] = ['1-3 Yaş', '4-6 Yaş', '7-9 Yaş', '10+ Yaş'];
const ATMOSPHERES: Atmosphere[] = ['Sakinleştirici/Uyku', 'Neşeli', 'Maceracı', 'Eğitici'];

function PillRow<T extends string>(props: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { label, options, value, onChange } = props;
  
  if (options.length === 0) return null; // Ses listesi boşsa gösterme
  
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContent}
        keyboardShouldPersistTaps="handled">
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={({ pressed }) => [
                styles.pill,
                selected ? styles.pillSelected : null,
                pressed ? styles.pillPressed : null,
              ]}>
              <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>{opt}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const [culture, setCulture] = useState<Culture>('Anadolu');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('4-6 Yaş');
  const [atmosphere, setAtmosphere] = useState<Atmosphere>('Neşeli');
  const [specialRequest, setSpecialRequest] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seslendirme State'leri
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);

  // Türkçe sesleri getir
  useEffect(() => {
    async function loadVoices() {
      try {
        const allVoices = await Speech.getAvailableVoicesAsync();
        const trVoices = allVoices.filter(v => v.language.startsWith('tr'));
        setVoices(trVoices);
        
        if (trVoices.length > 0) {
          // iOS'ta Yelda varsa onu seç, yoksa kalitesi en yüksek olanı bulmaya çalış
          const premiumVoice = trVoices.find(v => v.quality === Speech.VoiceQuality.Enhanced) || trVoices[0];
          setSelectedVoice(premiumVoice.identifier);
        }
      } catch (err) {
        console.warn('Sesler yüklenirken hata oluştu:', err);
      }
    }
    loadVoices();
  }, []);

  const canGenerate = useMemo(() => !isLoading, [isLoading]);

  const onGenerate = async () => {
    Keyboard.dismiss();
    setIsLoading(true);
    setStory(null);
    setError(null);
    stopStory(); // Varsa çalan sesi durdur

    try {
      const text = await generateStoryFromAPI({ culture, ageGroup, atmosphere, specialRequest });
      setStory(text);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const playStory = () => {
    if (!story) return;
    
    // Her ihtimale karşı önce durdur
    Speech.stop();
    setIsPlaying(true);
    
    Speech.speak(story, {
      language: 'tr-TR',
      voice: selectedVoice || undefined,
      pitch: 1.1, // Sesi biraz çocuksu/ince yapmak için
      rate: 0.9,  // Daha masalsı bir hız
      onDone: () => setIsPlaying(false),
      onStopped: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  };

  const stopStory = () => {
    Speech.stop();
    setIsPlaying(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Masal Üretici</Text>
            </View>
            <Text style={styles.headerSubtitle}>Çocuklar için renkli, ebeveynler için rahat.</Text>
          </View>

          {voices.length > 0 && (
            <>
              <PillRow<string>
                label="Masalcı Sesi"
                options={voices.map(v => v.name)}
                value={voices.find(v => v.identifier === selectedVoice)?.name || ''}
                onChange={(name) => {
                  const v = voices.find(v => v.name === name);
                  if (v) setSelectedVoice(v.identifier);
                }}
              />
              <View style={styles.spacer} />
            </>
          )}

          <PillRow<Culture> label="Kültür" options={CULTURES} value={culture} onChange={setCulture} />
          <View style={styles.spacer} />
          <PillRow<AgeGroup>
            label="Yaş Grubu"
            options={AGE_GROUPS}
            value={ageGroup}
            onChange={setAgeGroup}
          />
          <View style={styles.spacer} />
          <PillRow<Atmosphere>
            label="Duygu / Atmosfer"
            options={ATMOSPHERES}
            value={atmosphere}
            onChange={setAtmosphere}
          />
          <View style={styles.spacer} />

          <View style={[styles.card, styles.textCard]}>
            <Text style={styles.cardLabel}>Özel İstekler</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Örn: Minik bir kedi de olsun, ama korkutmasın..."
              placeholderTextColor="rgba(255,255,255,0.65)"
              value={specialRequest}
              onChangeText={setSpecialRequest}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.hintText}>İstersen boş bırakabilirsin.</Text>
          </View>

          <View style={styles.spacerLarge} />

          <Pressable
            disabled={!canGenerate}
            onPress={onGenerate}
            style={({ pressed }) => [
              styles.generateButton,
              !canGenerate ? styles.generateButtonDisabled : null,
              pressed ? styles.generateButtonPressed : null,
            ]}>
            <View style={styles.generateButtonInner}>
              {isLoading ? (
                <>
                  <ActivityIndicator color="white" />
                  <Text style={styles.generateButtonText}>Üretiyorum...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.generateButtonText}>Masal Üret</Text>
                  <Text style={styles.generateButtonSpark}>✨</Text>
                </>
              )}
            </View>
          </Pressable>

          <View style={styles.spacerLarge} />

          <View style={styles.storyCard}>
            <Text style={styles.storyTitle}>
              {error ? '⚠️ Hata' : story ? 'Hazır Masal' : 'Masal Alanı'}
            </Text>
            <Text style={styles.storySubtitle}>
              {error
                ? 'Bir sorun oluştu. Lütfen tekrar deneyin.'
                : story
                  ? 'Aşağıdan okuyabilirsin (kaydır).'
                  : '"Masal Üret"e basınca masal burada görünecek.'}
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.storyScroll}
                contentContainerStyle={styles.storyScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}>
                <Text style={styles.storyText}>
                  {story ??
                    'Henüz masal yok. Kültür, yaş grubu ve atmosferi seç; özel isteğini yaz; sonra masal üretsin.'}
                </Text>
              </ScrollView>
            )}

            {/* OYNATMA KONTROLLERİ */}
            {story && !error && (
              <View style={styles.playerControls}>
                {isPlaying ? (
                  <Pressable style={[styles.playButton, styles.stopButton]} onPress={stopStory}>
                    <Text style={styles.playButtonText}>⏹️ Dinlemeyi Durdur</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.playButton} onPress={playStory}>
                    <Text style={styles.playButtonText}>▶️ Masalı Dinle</Text>
                  </Pressable>
                )}
              </View>
            )}

          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1020',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B1020',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(120, 90, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(120, 90, 255, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  textCard: {
    paddingBottom: 12,
  },
  cardLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  pillsContent: {
    gap: 10,
    paddingVertical: 2,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pillSelected: {
    backgroundColor: 'rgba(255, 214, 102, 0.26)',
    borderColor: 'rgba(255, 214, 102, 0.85)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '800',
    fontSize: 13,
  },
  pillTextSelected: {
    color: '#fff',
  },
  spacer: {
    height: 10,
  },
  spacerLarge: {
    height: 18,
  },
  textInput: {
    width: '100%',
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(64, 180, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateButtonPressed: {
    opacity: 0.88,
  },
  generateButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  generateButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  generateButtonSpark: {
    color: 'white',
    fontSize: 18,
  },
  storyCard: {
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  storyTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  storySubtitle: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  storyScroll: {
    maxHeight: 260,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  storyScrollContent: {
    padding: 12,
  },
  storyText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 80, 80, 0.15)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.5)',
    padding: 14,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  playerControls: {
    marginTop: 16,
  },
  playButton: {
    backgroundColor: 'rgba(50, 200, 150, 0.25)',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(50, 200, 150, 0.7)',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: 'rgba(255, 100, 100, 0.2)',
    borderColor: 'rgba(255, 100, 100, 0.7)',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
