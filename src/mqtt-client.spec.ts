import { MqttClient } from './mqtt-client.js';

const client = () => {
  const c = new MqttClient({
    url: 'ws://x',
    appId: 'app1',
    moduleId: 'avatar',
  });
  c.setSessionId('s1');
  return c;
};

describe('MqttClient', () => {
  it('maps topic templates to subscriptions', () => {
    expect(
      client().mapTopics([
        'app/:appId/dialogue/messages/:sessionId',
        'app/:appId/ui/content/:sessionId/:x',
        'app/:appId/platform/app',
      ]),
    ).toEqual([
      'app/app1/dialogue/messages/s1',
      'app/app1/ui/content/s1/+',
      'app/app1/platform/app',
    ]);
  });

  it('skips templates with an unmapped app or session', () => {
    const c = new MqttClient({ url: 'ws://x', appId: 'app1', moduleId: 'm' });
    expect(c.mapTopics(['app/:appId/session/:sessionId'])).toEqual([]);
  });

  it('never subscribes to the user speech stream', () => {
    expect(
      client().mapTopics(['app/:appId/dialogue/user-speech/:sessionId']),
    ).toEqual([]);
  });

  it('closes the connection on disconnect', () => {
    const c = client();
    const end = vi.fn();
    (c as any).mqttClient = { connected: true, end, unsubscribe: vi.fn() };
    c.disconnect();
    expect(end).toHaveBeenCalledTimes(1);
    expect(c.getClient()).toBeUndefined();
  });

  it('adds identity to published messages', () => {
    const c = client();
    c.setUserId('u1');
    const publish = vi.fn();
    (c as any).mqttClient = { connected: true, publish };
    c.publish('dialogue/messages', { text: 'hi' });
    const [topic, payload] = publish.mock.calls[0];
    expect(topic).toBe('app/app1/dialogue/messages');
    expect(JSON.parse(payload)).toMatchObject({
      text: 'hi',
      appId: 'app1',
      sessionId: 's1',
      userId: 'u1',
      source: 'avatar',
    });
    expect(c.getACLEvents()).toEqual(['dialogue.messages:write']);
  });
});
