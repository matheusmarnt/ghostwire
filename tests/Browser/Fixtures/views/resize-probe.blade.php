<div>
    <div wire:ghost id="resize-host">
        <p>Row one</p>
        <p>Row two</p>
        <p>Row three</p>
    </div>
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
    @if ($refreshed)
        <span id="refreshed">refreshed</span>
    @endif
</div>
