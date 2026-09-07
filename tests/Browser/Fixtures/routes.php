<?php

use Illuminate\Support\Facades\Route;

Route::view('/ghostwire-test-page', 'ghostwire-fixtures::page', ['component' => 'demo-table']);

Route::view('/gallery/paginated-table', 'ghostwire-fixtures::page', ['component' => 'paginated-table']);
Route::view('/gallery/grouped-table', 'ghostwire-fixtures::page', ['component' => 'grouped-table']);
Route::view('/gallery/card-grid', 'ghostwire-fixtures::page', ['component' => 'card-grid']);
Route::view('/gallery/repeat-list', 'ghostwire-fixtures::page', ['component' => 'repeat-list']);
Route::view('/gallery/scrollable-kanban', 'ghostwire-fixtures::page', ['component' => 'scrollable-kanban']);
Route::view('/gallery/node-count', 'ghostwire-fixtures::page', ['component' => 'node-count']);

Route::view('/ghostwire-ghost-attribute-probe', 'ghostwire-fixtures::page', ['component' => 'ghost-attribute-probe']);
