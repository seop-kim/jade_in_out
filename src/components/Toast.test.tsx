import {act, render, screen} from '@testing-library/react';
import {ToastViewport} from './Toast';

describe('ToastViewport', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps an error toast for five seconds before sliding it out', () => {
    const onDismiss = jest.fn();

    render(
      <ToastViewport
        toasts={[{id: 1, message: '오류가 발생했습니다.'}]}
        onDismiss={onDismiss}
      />
    );

    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('오류가 발생했습니다.');
    expect(toast).not.toHaveClass('is-exiting');

    act(() => jest.advanceTimersByTime(5000));
    expect(toast).toHaveClass('is-exiting');

    act(() => jest.advanceTimersByTime(250));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('keeps a persistent success toast until the caller dismisses it', () => {
    const onDismiss = jest.fn();

    render(
      <ToastViewport
        toasts={[{id: 2, message: 'API loading', variant: 'success', persistent: true}]}
        onDismiss={onDismiss}
      />
    );

    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('toast-success');

    act(() => jest.advanceTimersByTime(10000));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => screen.getByRole('button', {name: /알림 닫기/}).click());
    expect(onDismiss).toHaveBeenCalledWith(2);
  });
});
