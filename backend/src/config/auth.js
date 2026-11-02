import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// JWT imzalama anahtarı yalnızca .env dosyasından okunur (koda gömülü yedek anahtar yok)
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil! Lütfen backend/.env dosyasına JWT_SECRET ekleyin.');
}

export const JWT_SECRET = process.env.JWT_SECRET;
