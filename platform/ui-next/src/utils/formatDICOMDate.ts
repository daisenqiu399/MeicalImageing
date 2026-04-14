import moment from 'moment';
import 'moment/locale/zh-cn';
import i18n from 'i18next';

/**
 * Formats DICOM date.
 *
 * @param {string} date
 * @param {string} strFormat
 * @returns {string} formatted date.
 */
export function formatDICOMDate(date: string, strFormat?: string): string {
  if (!date) {
    return '';
  }

  const format = strFormat ?? i18n.t('Common:localDateFormat', 'YYYY-MM-DD');
  const locale = i18n.language || 'zh';
  const parsed = moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (!parsed.isValid()) {
    return moment(date).locale(locale).format(format);
  }

  return parsed.locale(locale).format(format);
}
