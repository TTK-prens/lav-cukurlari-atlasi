import type { FeatureKey } from './match';

export interface Twin {
  dunya_id: string;
  benzerlik: number | null;
  bant: [number, number] | null;
  guven: 'yuksek' | 'orta' | 'dusuk' | 'yok';
  ortak_ozellik: number;
  ozellik_skor: Record<FeatureKey, number | null>;
  benzeyen_ozellikler: string[];
  farklar: string[];
}

export interface Candidate {
  aday_id: string;
  ad: string;
  ad_en: string | null;
  govde: 'mars' | 'ay';
  sinif: 'lav' | 'karst';
  alt_tip: string | null;
  bolge: string | null;
  enlem: number | null;
  boylam: number | null;
  boylam_180: number | null;
  konum_tipi: 'ozellik' | 'goruntu_merkezi' | 'bolge_merkezi' | null;
  kanit_seviyesi: 'A' | 'B' | 'C';
  ozellikler: {
    cap_m: number | null;
    cap_m_aralik: [number, number] | null;
    cap_m_metin: string | null;
    cap_tanimi: string | null;
    cap_tanimi_en: string | null;
    derinlik_m: number | null;
    derinlik_m_aralik: [number, number] | null;
    derinlik_m_metin: string | null;
    derinlik_tipi: string | null;
    dD: number | null;
    overhang: boolean | null;
    acik_giris: boolean | null;
    termal_tampon: boolean | null;
    termal_genlik_c: number | null;
    termal_not: string | null;
    termal_not_en: string | null;
  };
  kaynak: { olcu: string[]; konum: string[]; termal: string[] };
  not: string | null;
  ikizler: Twin[];
  benzemeyenler: string[];
  maliyet: {
    endeks: number | null;
    termal: number | null;
    su: number | null;
    kalkan: number | null;
    tugla: number | null;
    buz: number | null;
    buz_mesafe_km: number | null;
  };
}

export interface Earth {
  dunya_id: string;
  ad: string;
  ulke: string | null;
  ulke_en?: string | null;
  uzunluk_en?: string | null;
  boyut_en?: string | null;
  sicaklik_en?: string | null;
  yas_en?: string | null;
  buz_en?: string | null;
  not_en?: string | null;
  sinif: 'lav' | 'karst';
  alt_tip: string | null;
  enlem: number | null;
  boylam: number | null;
  konum_kaynak: string | null;
  uzunluk: string | null;
  boyut: string | null;
  gecit_genislik_m: string | null;
  cap_m: string | null;
  derinlik_m: string | null;
  derinlik_tipi: string | null;
  sicaklik: string | null;
  sicaklik_guven: string | null;
  yas: string | null;
  buz: string | null;
  analog_deney: string | null;
  analog_deney_en: string | null;
  gorsel: string | null;
  kaynaklar: string | null;
  not: string | null;
  ozellik: { dD: number | null; overhang: boolean | null; acik_giris: boolean | null; termal: boolean | null };
}

export interface Source {
  kaynak_id: string;
  baslik: string;
  url: string | null;
  tur: string;
  guven: string;
  dogrulama: string | null;
}

export interface MatchDoc {
  agirliklar: Record<FeatureKey, number>;
  adaylar: Candidate[];
  dunya: Earth[];
  kaynaklar: Source[];
}
