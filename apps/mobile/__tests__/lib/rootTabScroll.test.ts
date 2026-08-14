import {
  registerRootTabScroll,
  scrollRootTabToTop,
} from '@/lib/rootTabScroll';

describe('root tab scroll registry', () => {
  it('runs the registered handler when a root tab is retapped', () => {
    const handler = jest.fn();
    const unregister = registerRootTabScroll('home', handler);

    scrollRootTabToTop('home');

    expect(handler).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not remove a newer handler when an older screen unmounts', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unregisterFirst = registerRootTabScroll('profile', first);
    const unregisterSecond = registerRootTabScroll('profile', second);

    unregisterFirst();
    scrollRootTabToTop('profile');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unregisterSecond();
  });
});
