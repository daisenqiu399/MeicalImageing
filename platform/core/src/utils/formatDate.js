import moment from 'moment';
import 'moment/locale/zh-cn';
import i18n from 'i18next';

/**
 * Format date
 *
 * @param {string} date Date to be formatted
 * @param {string} format Desired date format
 * @returns {string} Formatted date
 */
export default (date, format = i18n.t('Common:localDateFormat', 'YYYY-MM-DD')) => {
  if (!date) {
    return '';
  }

  const locale = i18n.language || 'zh';
  const parsed = moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (!parsed.isValid()) {
    return moment(date).locale(locale).format(format);
  }

  return parsed.locale(locale).format(format);
};
