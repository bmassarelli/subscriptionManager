import { OPERATION_TYPE_CHART_TOKEN } from './constants';
import { TOKEN_COLOR } from './components/ui/PieChart';

describe('OPERATION_TYPE_CHART_TOKEN', () => {
  test('every chart token has a corresponding color defined in PieChart', () => {
    Object.values(OPERATION_TYPE_CHART_TOKEN).forEach(token => {
      expect(TOKEN_COLOR).toHaveProperty(token);
    });
  });
});
