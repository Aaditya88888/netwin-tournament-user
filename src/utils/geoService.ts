
export interface GeoLocation {
  country: string;
  countryCode: string;
  currency: 'INR' | 'NGN' | 'USD';
  isIndia: boolean;
}

const CURRENCY_MAP: Record<string, 'INR' | 'NGN' | 'USD'> = {
  'IN': 'INR',
  'NG': 'NGN',
};

export const detectUserCountry = async (): Promise<GeoLocation> => {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Failed to fetch geolocation');
    
    const data = await response.json();
    const countryCode = data.country_code || 'US';
    const countryName = data.country_name || 'United States';
    
    return {
      country: countryName,
      countryCode: countryCode,
      currency: CURRENCY_MAP[countryCode] || 'USD',
      isIndia: countryCode === 'IN',
    };
  } catch (error) {
    console.error('Geolocation detection failed:', error);
    // Default fallback
    return {
      country: 'United States',
      countryCode: 'US',
      currency: 'USD',
      isIndia: false,
    };
  }
};
