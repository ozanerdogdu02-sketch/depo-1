import { createContext, useContext, useState, ReactNode } from 'react';

export interface FinancialTopic {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  completed: boolean;
}

export interface SportSession {
  id: string;
  date: string;
  type: string;
  duration: number;
  completed: boolean;
}

export interface MoodEntry {
  id: string;
  date: string;
  score: number;
  situation: string;
  automaticThought: string;
  reframedThought: string;
  emotion: string;
}

interface AppContextType {
  topics: FinancialTopic[];
  toggleTopic: (id: string) => void;
  sports: SportSession[];
  toggleSport: (id: string) => void;
  moodEntries: MoodEntry[];
  addMoodEntry: (entry: Omit<MoodEntry, 'id'>) => void;
  weeklyGoal: number;
}

const today = new Date();
const dateStr = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
};

const initialTopics: FinancialTopic[] = [
  { id: '1', title: 'NBD', subtitle: 'Net Bugünkü Değer (NPV)', category: 'Değerleme', completed: true },
  { id: '2', title: 'WACC', subtitle: 'Ağırlıklı Ortalama Sermaye Maliyeti', category: 'Değerleme', completed: true },
  { id: '3', title: 'DCF', subtitle: 'İndirgenmiş Nakit Akışları Analizi', category: 'Değerleme', completed: false },
  { id: '4', title: 'Beta Katsayısı', subtitle: 'Sistematik Risk Ölçümü', category: 'Risk', completed: false },
  { id: '5', title: 'Sermaye Yapısı', subtitle: 'Borç-Özsermaye Optimizasyonu', category: 'Finans', completed: true },
  { id: '6', title: 'Finansal Tablolar', subtitle: 'Bilanço ve Gelir Tablosu Analizi', category: 'Analiz', completed: false },
  { id: '7', title: 'Oran Analizi', subtitle: 'Likidite, Kârlılık, Verimlilik', category: 'Analiz', completed: false },
  { id: '8', title: 'Opsiyon Fiyatlaması', subtitle: 'Black-Scholes Modeli', category: 'Türevler', completed: false },
  { id: '9', title: 'Portföy Teorisi', subtitle: 'Markowitz Etkin Sınır', category: 'Yatırım', completed: false },
  { id: '10', title: 'Tahvil Değerlemesi', subtitle: 'Verim ve Süre Hesaplama', category: 'Sabit Getiri', completed: false },
];

const initialSports: SportSession[] = [
  { id: 's1', date: dateStr(6), type: 'Kuvvet Antrenmanı', duration: 60, completed: true },
  { id: 's2', date: dateStr(5), type: 'Kardiyo', duration: 45, completed: true },
  { id: 's3', date: dateStr(4), type: 'Dinlenme', duration: 0, completed: false },
  { id: 's4', date: dateStr(3), type: 'HIIT', duration: 40, completed: true },
  { id: 's5', date: dateStr(2), type: 'Esneklik & Yoga', duration: 50, completed: true },
  { id: 's6', date: dateStr(1), type: 'Kuvvet Antrenmanı', duration: 65, completed: false },
  { id: 's7', date: dateStr(0), type: 'Kardiyo', duration: 45, completed: false },
];

const initialMoodEntries: MoodEntry[] = [
  {
    id: 'm1',
    date: dateStr(1),
    score: 2,
    situation: 'Hafta sonu evde yalnız kaldım, sosyal medyada gezinirken kendimi başkalarıyla kıyasladım.',
    automaticThought: 'Hiçbir şey başaramıyorum, herkes benden daha başarılı ve mutlu.',
    reframedThought: 'Sosyal medya gerçeği yansıtmıyor. Benim de ilerlediğim alanlar var; bugün spor yaptım ve ders çalıştım.',
    emotion: 'Umutsuzluk, Kıyaslama',
  },
  {
    id: 'm2',
    date: dateStr(7),
    score: 3,
    situation: 'Sınav hazırlığı sırasında konsantre olamadım ve zaman kaybettim.',
    automaticThought: 'Yeterince disiplinli değilim, bu sınavı geçemeyeceğim.',
    reframedThought: 'Konsantrasyonun dalgalı olması normal. Küçük molalar verimlilik sağlayabilir; bugünkü toplam çalışma sürem 3 saatti.',
    emotion: 'Kaygı, Hayal Kırıklığı',
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [topics, setTopics] = useState<FinancialTopic[]>(initialTopics);
  const [sports, setSports] = useState<SportSession[]>(initialSports);
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>(initialMoodEntries);

  const toggleTopic = (id: string) =>
    setTopics(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));

  const toggleSport = (id: string) =>
    setSports(prev => prev.map(s => s.id === id ? { ...s, completed: !s.completed } : s));

  const addMoodEntry = (entry: Omit<MoodEntry, 'id'>) =>
    setMoodEntries(prev => [{ ...entry, id: `m${Date.now()}` }, ...prev]);

  return (
    <AppContext.Provider value={{ topics, toggleTopic, sports, toggleSport, moodEntries, addMoodEntry, weeklyGoal: 4 }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
