/**
 * Luhn checksum algorithm implementation for validating 15-digit IMEIs
 */
export function validateIMEILuhn(imei: string): { isValid: boolean; error?: string } {
  if (!imei) {
    return { isValid: false, error: 'IMEI is required' };
  }

  const cleanImei = imei.trim().replace(/[-\s]/g, '');

  if (!/^\d{14,16}$/.test(cleanImei)) {
    return { isValid: false, error: 'IMEI must contain between 14 and 16 digits' };
  }

  // 15-digit IMEI standard Luhn check
  if (cleanImei.length === 15) {
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(cleanImei.charAt(i), 10);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
    }

    if (sum % 10 !== 0) {
      return { isValid: false, error: 'Invalid IMEI checksum (Luhn check failed)' };
    }
  }

  return { isValid: true };
}

/**
 * Mask an IMEI for sensitive screens (e.g., 356789******789)
 */
export function maskIMEI(imei: string): string {
  if (!imei || imei.length < 8) return imei || '';
  const first = imei.substring(0, 6);
  const last = imei.substring(imei.length - 4);
  const middle = '*'.repeat(imei.length - 10 > 0 ? imei.length - 10 : 4);
  return `${first}${middle}${last}`;
}
