import apiClient from '../utils/api';
import { User } from '../types';

export const userService = {
    searchByWallet: async (wallet: string): Promise<User> => {
        const response = await apiClient.get<User>(`/users/search?wallet=${wallet}`);
        return response.data;
    }
};
