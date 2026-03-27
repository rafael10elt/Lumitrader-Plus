# Lumitrader Python Layer

Esta pasta contém utilitários e launchers auxiliares. O bridge principal usado em produção deve ser tratado como `LumitraderBridge/`.

## Conteúdo

- `send_test_event.py`: envia evento manual de teste para o backend
- `run_mt5_reporter.ps1` / `.bat`: launchers auxiliares
- `install_mt5_reporter_task.ps1`: instalação opcional de tarefa agendada
- `mt5_reporter.py` e `mt5_reporter_vps_conta1.py`: arquivos legados de bridge, mantidos apenas como referência temporária

## Status

- produção: usar `LumitraderBridge/mt5_reporter.py`
- VPS multi-instância: usar uma pasta `LumitraderBridge-X` por conta
- esta pasta `python/` não é a fonte principal do bridge operacional atual

## Teste manual

```bash
pip install -r requirements.txt
python send_test_event.py
```

## Observação

Se esta pasta não estiver mais sendo usada no seu fluxo de deploy, ela é candidata a remoção completa em uma próxima limpeza.
