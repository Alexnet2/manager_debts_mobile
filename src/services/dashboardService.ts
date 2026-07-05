import api from './api';
import { GlobalDashboard, PersonDashboard, PersonScore } from '../types';

export const dashboardService = {
  getGlobal: async (params?: { startDate?: string; endDate?: string }): Promise<GlobalDashboard> => {
    const response = await api.get<GlobalDashboard>('/dashboard', { params });
    return response.data;
  },

  getPerson: async (personId: string): Promise<PersonDashboard> => {
    const response = await api.get<PersonDashboard>(`/people/${personId}/dashboard`);
    return response.data;
  },

  getPersonScore: async (personId: string): Promise<PersonScore> => {
    const response = await api.get<PersonScore>(`/people/${personId}/score`);
    return response.data;
  },
};
