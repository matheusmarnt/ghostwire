<div>
    <div wire:ghost.panels id="panel-card-host">
        <div class="card" style="background: #ffffff; border-radius: 12px; padding: 16px;">
            <p>Card title</p>
            <p>Card body text</p>
        </div>
    </div>
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
    @if ($refreshed)
        <span id="refreshed">refreshed</span>
    @endif
</div>
