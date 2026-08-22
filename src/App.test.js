import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('shows lock screen then unlocks app with passcode', () => {
  render(<App />);

  expect(screen.getByText(/enter passcode/i)).toBeInTheDocument();

  for (const digit of '5207') {
    fireEvent.click(screen.getByRole('button', { name: digit }));
  }

  expect(screen.getByText(/task reminder/i)).toBeInTheDocument();
});
