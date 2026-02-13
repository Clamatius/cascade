let wordSet: Set<string> | null = null;
let loading: Promise<void> | null = null;

export function loadDictionary(): Promise<void> {
  if (wordSet) return Promise.resolve();
  if (loading) return loading;

  loading = fetch(`${import.meta.env.BASE_URL}words.txt`)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load dictionary: ${res.status}`);
      return res.text();
    })
    .then(text => {
      wordSet = new Set(
        text.split('\n')
          .map(w => w.trim().toUpperCase())
          .filter(w => w.length >= 2)
      );
      console.log(`Dictionary loaded: ${wordSet.size} words`);
    });

  return loading;
}

export function isWord(word: string): boolean {
  if (!wordSet) return false;
  return wordSet.has(word.toUpperCase());
}

export function isDictionaryLoaded(): boolean {
  return wordSet !== null;
}
