<div>
    <div wire:ghost.delay.600ms.hold.2000ms id="timing-host">
        <p>Row one</p>
        <p>Row two</p>
        <p>Row three</p>
    </div>
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
    @if ($refreshed)
        <span id="refreshed">refreshed</span>
    @endif
</div>
