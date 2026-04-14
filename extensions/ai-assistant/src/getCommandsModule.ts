function getCommandsModule({ servicesManager }) {
  const { aiAssistantService } = servicesManager.services;

  const actions = {
    generateAiReportDraft: async options => {
      return aiAssistantService.generateReportDraft(options);
    },
    clearAiDraft: () => {
      aiAssistantService.clearDraft();
    },
  };

  const definitions = {
    generateAiReportDraft: actions.generateAiReportDraft,
    clearAiDraft: actions.clearAiDraft,
  };

  return {
    actions,
    definitions,
    defaultContext: 'DEFAULT',
  };
}

export default getCommandsModule;
