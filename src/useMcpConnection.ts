import { useEffect, useRef, useState } from 'react';
import { boardsRepository } from './lib/storage';
import { forgetBridge, pairBridge, startBridge, storedBridge, type BridgeConnection, type BridgeStatus } from './lib/mcp-bridge';
import type { BridgeCommand } from '../shared/mcp-contract';

export function useMcpConnection(execute: (command: BridgeCommand, signal?: AbortSignal) => Promise<Record<string, unknown>>) {
  const [connection, setConnection] = useState<BridgeConnection | undefined>(storedBridge);
  const [status, setStatus] = useState<BridgeStatus>('disconnected');
  const [error, setError] = useState('');
  const controller = useRef<ReturnType<typeof startBridge> | undefined>(undefined);
  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    if (!connection) return;
    const bridge = startBridge(connection, (command, signal) => executeRef.current(command, signal), (next, message) => { setStatus(next); setError(message ?? ''); });
    controller.current = bridge;
    return () => { bridge.stop(); controller.current = undefined; };
  }, [connection]);

  const connect = async (endpoint: string, code: string) => {
    let workspaceId = await boardsRepository.getSetting<string>('mcpWorkspaceId', '');
    if (!workspaceId) { workspaceId = crypto.randomUUID(); await boardsRepository.setSetting('mcpWorkspaceId', workspaceId); }
    const value = await pairBridge(endpoint, code.trim(), workspaceId);
    setError(''); setStatus('connecting'); setConnection(value);
  };
  const disconnect = async () => {
    try { await controller.current?.disconnect(); }
    finally { forgetBridge(); setConnection(undefined); setStatus('disconnected'); }
  };
  return { connection, status, error, connect, disconnect };
}
