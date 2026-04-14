const languagesMap = {
  zh: '简体中文',
  'zh-CN': '简体中文',
  'zh-cn': '简体中文',
};

const getLanguageLabel = language => {
  return languagesMap[language];
};

export default function getAvailableLanguagesInfo(locales) {
  const availableLanguagesInfo = [];

  Object.keys(locales).forEach(key => {
    availableLanguagesInfo.push({
      value: key,
      label: getLanguageLabel(key) || key,
    });
  });

  return availableLanguagesInfo;
}

export { getAvailableLanguagesInfo, getLanguageLabel };
