// Hourly rain forecast from Open-Meteo (free, no key), in Spanish time.
// Keep wet() in step with the one in app.js.
export type Hour = { t: string; prob: number; mm: number }; // t: "YYYY-MM-DDTHH:00"

export const wet = (h: Hour) => h.prob >= 50 || h.mm >= 0.5;

export async function forecast(lat: number, lon: number): Promise<Hour[] | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&hourly=precipitation_probability,precipitation&timezone=Europe%2FMadrid&forecast_days=2";
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { hourly: h } = await res.json();
    return (h.time as string[]).map((t, i) => ({ t, prob: h.precipitation_probability[i] ?? 0, mm: h.precipitation[i] ?? 0 }));
  } catch (_) {
    return null;
  }
}

// Rainy spells within a list of hours: [{ from: "16:00", to: "19:00", peak: 80 }].
export function spells(hours: Hour[]) {
  const out: { from: string; to: string; peak: number }[] = [];
  for (let i = 0; i < hours.length; i++) {
    if (!wet(hours[i])) continue;
    let j = i, peak = 0;
    while (j < hours.length && wet(hours[j])) peak = Math.max(peak, hours[j++].prob);
    const to = j < hours.length ? hours[j].t.slice(11, 16) : `${String(Number(hours[j - 1].t.slice(11, 13)) + 1).padStart(2, "0")}:00`;
    out.push({ from: hours[i].t.slice(11, 16), to, peak });
    i = j;
  }
  return out;
}
