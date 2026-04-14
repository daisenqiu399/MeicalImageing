/* eslint-disable @typescript-eslint/no-namespace */
import AIAssistantService from '../services/AIAssistantService';

declare global {
  namespace AppTypes {
    export type AIAssistantServiceType = AIAssistantService;
    export interface Services {
      aiAssistantService?: AIAssistantService;
    }
  }
}
