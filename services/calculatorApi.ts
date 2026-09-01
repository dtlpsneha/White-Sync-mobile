import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPost } from '../utils/api';
import { API_BASE_URL as BASE_URL } from '../constants/config';

// Note: The prompt specified API Key and Secret in headers. 
// You should update these with your actual keys or fetch them from SecureStore if available.
const API_KEY = 'YOUR_API_KEY';
const API_SECRET = 'YOUR_API_SECRET';

export interface Grade {
    name: string;
    grade: string;
    uom: string;
    joint_type?: string;
}

export interface CalculateBeltPriceParams {
    id: string; // Grade name
    length_mm: number;
    width_mm: number;
    quantity: number;
    joint_type: string;
}

export interface CalculateBeltPriceResponse {
    id: string;
    grade: string;
    product_category: string;
    joint_type: string;
    uom: string;
    length_mm: number;
    width_mm: number;
    quantity: number;
    custom_item_name: string;
    area_sqm: number;
    base_price_inr: number;
    slitting_charges: number;
    joining_charges: number;
    final_price_inr: number;
}

const getHeaders = () => {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    
    // Only add Authorization header if keys are actually configured
    if (API_KEY !== 'YOUR_API_KEY' && API_SECRET !== 'YOUR_API_SECRET') {
        headers['Authorization'] = `token ${API_KEY}:${API_SECRET}`;
    }
    
    return headers;
};

export const fetchGrades = async (): Promise<Grade[]> => {
    try {
        const sessionCookies = await SecureStore.getItemAsync('session_cookies');
        
        // Try with Authorization headers, fallback to sessionCookies if needed
        const url = `${BASE_URL}/api/resource/Habasit Price Master?fields=["name","grade","uom","joint_type"]&limit_page_length=None`;
        const res = await apiGet(url, sessionCookies, getHeaders());
        
        if (res.ok && res.data && res.data.data) {
            return res.data.data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching grades:', error);
        return [];
    }
};

export const calculateBeltPrice = async (params: CalculateBeltPriceParams): Promise<CalculateBeltPriceResponse | null> => {
    try {
        const sessionCookies = await SecureStore.getItemAsync('session_cookies');
        const url = `${BASE_URL}/api/method/calculate_belt_price`;
        
        const res = await apiPost(url, params, sessionCookies, getHeaders());
        
        if (res.ok && res.data && res.data.success && res.data.data) {
            return res.data.data;
        }
        return null;
    } catch (error) {
        console.error('Error calculating belt price:', error);
        return null;
    }
};
