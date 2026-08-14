import {render, screen} from '@testing-library/react';
import LastFetchedLabel from './LastFetchedLabel';

describe('LastFetchedLabel', () => {
  test('does not render before a successful fetch', () => {
    const {container} = render(<LastFetchedLabel value={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('renders the most recent successful fetch time', () => {
    render(<LastFetchedLabel value={new Date(2026, 7, 14, 14, 32)} />);

    expect(screen.getByRole('status')).toHaveTextContent('최근 조회 2026. 08. 14. 14:32');
  });
});
